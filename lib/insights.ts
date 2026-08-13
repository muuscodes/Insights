import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'

import { formatCoordParam, parseCoordParam, type LatLng } from './geo'
import { fetchBirds } from './providers/gbif'
import { fetchDemographics, lookupTract, type TractInfo } from './providers/census'
import { fetchDrivePois, fetchNearPois } from './providers/overpass'
import { reverseLabel } from './providers/photon'
import { computeScentProfile } from './scoring/scent'
import { scoreMode } from './scoring/score'
import { computeUrbanIndex } from './scoring/urban'
import type {
  Bird,
  CoreInsights,
  Demographics,
  InsightsPayload,
  MapPoi,
  Panel,
  Poi,
  ScoreResult,
} from './types'

/**
 * Assemble everything for one address.
 *
 * Providers are independent, so one going down degrades a single panel instead
 * of the page. Every panel is a discriminated union carrying either data or a
 * reason, and the UI renders the reason rather than an empty box.
 *
 * The whole assembled payload is cached; see `buildInsightsForCoords` at the
 * bottom of this file for why that happens here rather than per-fetch.
 */

/**
 * Keep the client payload bounded on dense addresses. Also keeps the cached
 * entry far inside Next's 2 MB per-item ceiling.
 */
const MAX_MAP_POIS = 600

/**
 * Thin a dense POI set down for the map.
 *
 * Taking the nearest N looks wrong: on a dense address the dots pack into a
 * disc in the middle and the outer half of the 1-mile circle reads as empty,
 * which it is not. Stepping evenly through the distance-sorted list keeps the
 * true radial spread while still bounding the payload.
 */
function sampleForMap(pois: readonly Poi[], limit: number): Poi[] {
  if (pois.length <= limit) return [...pois]

  const step = pois.length / limit
  const sampled: Poi[] = []
  for (let i = 0; i < limit; i++) {
    const poi = pois[Math.floor(i * step)]
    if (poi) sampled.push(poi)
  }
  return sampled
}

/**
 * What actually goes in the cache entry: the report the page renders, plus the
 * 1-mile POI set the streamed driving score starts from.
 */
interface CachedCore {
  payload: CoreInsights
  nearPois: Poi[]
  /** Distinguishes "no amenities here" from "the query did not come back". */
  nearFetchFailed: boolean
}

function panelOk<T>(data: T): Panel<T> {
  return { ok: true, data }
}

function panelFailed(error: unknown, fallback: string, panel: string): Panel<never> {
  const message = error instanceof Error ? error.message : String(error)

  // Logged server-side only. Without this a failing provider is invisible: the
  // page still renders, just with a panel quietly missing.
  if (error) console.error(`[insights] ${panel} panel failed:`, message)

  // Provider internals are not useful to a visitor, but the specific case of a
  // missing Census key is worth surfacing plainly since it is a setup issue.
  if (message.includes('CENSUS_API_KEY')) {
    return { ok: false, reason: 'Census API key not configured for this deployment.' }
  }
  return { ok: false, reason: fallback }
}

async function assemble(center: LatLng): Promise<CachedCore> {
  const poisPromise = fetchNearPois(center)
  const birdsPromise = fetchBirds(center)
  const tractPromise = lookupTract(center)

  // Demographics depend on the tract, so chain rather than race them. The catch
  // keeps this from becoming an unhandled rejection while allSettled is still
  // waiting on the slower POI query.
  const demographicsPromise: Promise<Demographics> = tractPromise.then((tract) => {
    if (!tract) throw new Error('No census tract covers this location')
    return fetchDemographics(tract)
  })
  demographicsPromise.catch(() => undefined)

  // Always resolved server-side rather than taken from `?q=`, so one cache entry
  // serves a link shared with or without that parameter. The caller re-applies
  // the caller-supplied label afterwards, outside the cache.
  const labelPromise: Promise<string | null> = reverseLabel(center)

  const [poisResult, birdsResult, tractResult, demographicsResult, labelResult] =
    await Promise.allSettled([
      poisPromise,
      birdsPromise,
      tractPromise,
      demographicsPromise,
      labelPromise,
    ])

  const pois = poisResult.status === 'fulfilled' ? poisResult.value : null
  const tract: TractInfo | null = tractResult.status === 'fulfilled' ? tractResult.value : null
  const demographics: Demographics | null =
    demographicsResult.status === 'fulfilled' ? demographicsResult.value : null

  const label =
    (labelResult.status === 'fulfilled' ? labelResult.value : null) ?? formatCoordParam(center)

  /* Scores ---------------------------------------------------------------- */

  const walk: Panel<ReturnType<typeof scoreMode>> = pois
    ? panelOk(scoreMode(pois.nearPois, 'walk'))
    : panelFailed(
        poisResult.status === 'rejected' ? poisResult.reason : null,
        'Amenity data is temporarily unavailable.',
        'walk',
      )

  /* Urban index ------------------------------------------------------------ */

  const urban = pois
    ? panelOk(
        computeUrbanIndex({
          poiCount: pois.nearPois.length,
          population: demographics?.population ?? null,
          // Prefer the tract land area even when ACS itself failed, since the
          // geocoder hands it back independently.
          landAreaSqMi: demographics?.landAreaSqMi ?? tract?.landAreaSqMi ?? null,
          specialUseTract: tract?.specialUse ?? false,
        }),
      )
    : panelFailed(null, 'Needs amenity data, which is temporarily unavailable.', 'urban')

  /* Scent ------------------------------------------------------------------ */

  const scent = pois
    ? panelOk(computeScentProfile(pois.nearFeatures))
    : panelFailed(null, 'Needs amenity data, which is temporarily unavailable.', 'scent')

  /* Demographics ----------------------------------------------------------- */

  const demographicsPanel: Panel<Demographics> = demographics
    ? panelOk(demographics)
    : panelFailed(
        demographicsResult.status === 'rejected' ? demographicsResult.reason : null,
        'Census demographics are unavailable for this location.',
        'demographics',
      )

  /* Birds ------------------------------------------------------------------ */

  const birds: Panel<Bird[]> =
    birdsResult.status === 'fulfilled'
      ? panelOk(birdsResult.value)
      : panelFailed(birdsResult.reason, 'Bird observations are temporarily unavailable.', 'birds')

  /* Map ------------------------------------------------------------------- */

  const sortedByDistance = (pois?.nearPois ?? []).slice().sort((a, b) => a.distanceM - b.distanceM)

  const mapPois: MapPoi[] = sampleForMap(sortedByDistance, MAX_MAP_POIS).map(
    ({ id, name, lat, lng, distanceM, category }) => ({
      id,
      name,
      lat,
      lng,
      distanceM,
      category,
    }),
  )

  return {
    payload: {
      address: {
        formatted: label,
        lat: center.lat,
        lng: center.lng,
        tractGeoid: tract?.geoid ?? null,
      },
      walk,
      urban,
      scent,
      demographics: demographicsPanel,
      birds,
      mapPois,
      generatedAt: new Date().toISOString(),
    },
    // Carried so the driving score can start from the 1-mile set without
    // fetching it a second time. Tags are already trimmed to the handful the
    // classifier reads, so this stays small enough to cache.
    nearPois: pois?.nearPois ?? [],
    nearFetchFailed: pois === null,
  }
}

/**
 * The driving score, on its own.
 *
 * Split out because it is the only part of the report that needs the 5-mile
 * Overpass pass, and that pass is irreducibly slow over a sparse address: 9.9s
 * on the healthiest mirror, against 1.5s for the 1-mile pass. Holding the whole
 * page back for it meant a rural cold start could not come in under 10s no
 * matter how healthy the upstream was.
 *
 * It starts from the core report's 1-mile set rather than fetching its own.
 * That is not just an optimisation: `unstable_cache` is a read-through cache
 * with no in-flight deduplication, so when this had its own cached 1-mile fetch
 * both halves of the page missed the cold cache at the same instant and issued
 * a query each. The primary mirror allows two concurrent queries per IP, so the
 * pair ate the entire allowance and queued behind each other. Measured with
 * that bug present, a dense address that needs no wide pass at all took 35.3s.
 */
async function assembleDrive(center: LatLng): Promise<Panel<ScoreResult>> {
  const { nearPois, nearFetchFailed } = await cachedCore(center)

  if (nearFetchFailed) {
    return { ok: false, reason: 'Amenity data is temporarily unavailable.' }
  }

  try {
    const { drivePois } = await fetchDrivePois(center, nearPois)
    return panelOk(scoreMode(drivePois, 'drive'))
  } catch (error) {
    return panelFailed(error, 'Amenity data is temporarily unavailable.', 'drive')
  }
}

/* -------------------------------------------------------------------------- */
/* Caching                                                                    */
/* -------------------------------------------------------------------------- */

const CACHE_TTL_SECONDS = 60 * 60 * 24

/**
 * Cache the finished payload rather than the upstream responses.
 *
 * The per-fetch cache on the Overpass call looked like it covered this, but it
 * silently never engaged in the places that matter. Next's data cache refuses
 * any entry over 2 MB, and a 1-mile query over a dense address comes back at
 * roughly 2.4 MB:
 *
 *   Failed to set Next.js data cache for https://overpass-api.de/api/interpreter,
 *   items over 2MB can not be cached (2418244 bytes)
 *
 * So every request re-ran two Overpass queries, which got us throttled, which
 * made the next request slower still. Measured on one address, three requests
 * in a row: 6.5s, 3.9s, then 61.6s with both score panels degraded. A sparse
 * rural address, whose response does fit, went 31.9s then 0.76s then 0.25s.
 *
 * The assembled payload is about 88 KB, comfortably inside the limit, and it
 * subsumes the Census, GBIF and Photon calls as well. Cities now behave the way
 * rural addresses already did: expensive once, then instant.
 */
/*
  Keyed on the canonical 6-decimal form, which is exactly what the URL carries,
  so the same shared link always lands on the same entry. Rounding coarser to
  pool neighbouring lookups was tempting but wrong: 4 decimals is ~11 m, and two
  genuinely different street addresses fit inside that.
*/
const keyFor = (center: LatLng): string => formatCoordParam(center)

/**
 * The core report, cached across requests and deduplicated within one.
 *
 * Two layers, doing different jobs, both load-bearing:
 *
 *   `unstable_cache` is the cross-request cache, so a second visitor to an
 *   address pays nothing.
 *
 *   React's `cache` deduplicates *within* a single request. The page renders
 *   the report and the streamed driving score as two concurrent subtrees, and
 *   both need this. `unstable_cache` is read-through with no in-flight
 *   deduplication, so on a cold cache both would call it and both would run the
 *   1-mile Overpass query. Wrapping it here makes them share one promise.
 */
/*
  Keyed on the coordinate *string*, not the LatLng object. React's `cache`
  compares arguments by identity, and every caller parses its own object out of
  the URL, so keying on the object deduplicates nothing: `generateMetadata` and
  the page body each built their own, and the report was assembled twice per
  request. With the streamed driving score added that became two concurrent
  1-mile Overpass queries against a mirror that allows two per IP, and a dense
  address that should take four seconds took 35.2s with its walk panel failing.
*/
const cachedCoreByKey = cache((key: string): Promise<CachedCore> => {
  const center = parseCoordParam(key)
  if (!center) throw new Error(`Unparseable coordinate key: ${key}`)

  return unstable_cache(() => assemble(center), ['core', key], {
    revalidate: CACHE_TTL_SECONDS,
    tags: ['insights'],
  })()
})

const cachedCore = (center: LatLng): Promise<CachedCore> => cachedCoreByKey(keyFor(center))

/**
 * Everything except the driving score, reusing a cached report when there is
 * one. `providedLabel` is display text from `?q=` and is applied on top of the
 * cached payload, never baked into it.
 */
export async function buildCoreInsights(
  center: LatLng,
  providedLabel?: string,
): Promise<CoreInsights> {
  const { payload } = await cachedCore(center)

  if (!providedLabel) return payload

  return { ...payload, address: { ...payload.address, formatted: providedLabel } }
}

/**
 * The driving score, awaited separately so it never holds the page back.
 *
 * Cached on its own key as well, so the wide pass is paid once per address
 * rather than once per visit, and deduplicated within a request for the same
 * reason the core is.
 */
const driveScoreByKey = cache((key: string): Promise<Panel<ScoreResult>> => {
  const center = parseCoordParam(key)
  if (!center) throw new Error(`Unparseable coordinate key: ${key}`)

  return unstable_cache(() => assembleDrive(center), ['drive', key], {
    revalidate: CACHE_TTL_SECONDS,
    tags: ['insights'],
  })()
})

export const buildDriveScore = (center: LatLng): Promise<Panel<ScoreResult>> =>
  driveScoreByKey(keyFor(center))

/**
 * The complete report, core plus driving score.
 *
 * Only for callers that genuinely need one object, such as the JSON route. The
 * page deliberately does not use this: it renders the core and streams the
 * driving score in behind it.
 */
export async function buildInsights(
  center: LatLng,
  providedLabel?: string,
): Promise<InsightsPayload> {
  const [core, drive] = await Promise.all([
    buildCoreInsights(center, providedLabel),
    buildDriveScore(center),
  ])

  return { ...core, drive }
}
