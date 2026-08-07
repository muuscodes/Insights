import 'server-only'

import { formatCoordParam, type LatLng } from './geo'
import { fetchBirds } from './providers/gbif'
import { fetchDemographics, lookupTract, type TractInfo } from './providers/census'
import { fetchPois } from './providers/overpass'
import { reverseLabel } from './providers/photon'
import { computeScentProfile } from './scoring/scent'
import { scoreMode } from './scoring/score'
import { computeUrbanIndex } from './scoring/urban'
import type { Bird, Demographics, InsightsPayload, MapPoi, Panel, Poi } from './types'

/**
 * Assemble everything for one address.
 *
 * Providers are independent, so one going down degrades a single panel instead
 * of the page. Every panel is a discriminated union carrying either data or a
 * reason, and the UI renders the reason rather than an empty box.
 */

/** Keep the client payload bounded on dense addresses. */
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

export async function buildInsights(
  center: LatLng,
  providedLabel?: string,
): Promise<InsightsPayload> {
  const poisPromise = fetchPois(center)
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

  const labelPromise: Promise<string | null> = providedLabel
    ? Promise.resolve(providedLabel)
    : reverseLabel(center)

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

  const drive: Panel<ReturnType<typeof scoreMode>> = pois
    ? panelOk(scoreMode(pois.drivePois, 'drive'))
    : panelFailed(
        poisResult.status === 'rejected' ? poisResult.reason : null,
        'Amenity data is temporarily unavailable.',
        'drive',
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
    address: {
      formatted: label,
      lat: center.lat,
      lng: center.lng,
      tractGeoid: tract?.geoid ?? null,
    },
    walk,
    drive,
    urban,
    scent,
    demographics: demographicsPanel,
    birds,
    mapPois,
    generatedAt: new Date().toISOString(),
  }
}
