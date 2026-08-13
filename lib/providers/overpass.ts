import 'server-only'

import { DRIVE_RADIUS_M, WALK_RADIUS_M, haversineMeters, type LatLng } from '../geo'
import { UpstreamError, fetchJson, hedgedRace } from '../http'
import { dedupePois } from '../scoring/dedupe'
import { SCENT_TAG_KEYS } from '../scoring/scent'
import {
  CLASSIFY_TAG_KEYS,
  NEAR_QUERY_FILTERS,
  OVERPASS_MIRRORS,
  WIDE_FILTERS,
  classify,
  type CategoryKey,
  type OsmFilter,
} from '../scoring/taxonomy'
import type { Poi, TaggedFeature } from '../types'

/**
 * OpenStreetMap POI data via Overpass.
 *
 * Public instances rate limit hard and time out under load, so requests walk
 * down a mirror list and the queries themselves are shaped to be cheap.
 *
 * Repeat visits are absorbed one level up: the assembled report is cached in
 * `lib/insights.ts`, not here. The per-fetch `revalidate` below is kept because
 * it still helps sparse addresses, but it cannot be relied on, since a dense
 * response runs past the 2 MB ceiling on a data cache entry and is silently
 * refused. That is what made every request re-run this.
 */

const CACHE_SECONDS = 60 * 60 * 24

/**
 * How long one mirror gets before we give up on it entirely.
 *
 * Kept generous on purpose, because with the hedge below this no longer sets
 * the latency. A slow leader is overtaken after HEDGE_DELAY_MS rather than
 * waited out, so a long timeout costs nothing and a short one is actively
 * harmful: cutting this to 15s produced seven spurious query failures in one
 * test run, since a mirror that is merely queueing us behind its rate limit
 * still answers correctly given a little longer.
 *
 * The server-side value matters as much as ours: it tells Overpass to abandon
 * an expensive query rather than hold the connection until we give up on it.
 */
const REQUEST_TIMEOUT_MS = 25_000
const OVERPASS_TIMEOUT_S = 25

/**
 * Head start the leading mirror gets before the next is launched alongside it.
 *
 * Sits above the normal success time so a healthy request never pays for the
 * hedge. Measured on the fastest mirror: the 1-mile query is 4.1s over a dense
 * address and 1.5s over a sparse one, and the 5-mile query is 7.4s. A slow
 * mirror now costs 5s before a second opinion is sought, rather than a full
 * timeout before one is permitted.
 */
const HEDGE_DELAY_MS = 5_000

/**
 * Wall-clock budget for one pass, covering however many mirrors it tries.
 *
 * Per-request timeouts alone do not bound a pass. Three mirrors at 15s each is
 * 45s on its own, and before this existed a cold rural address measured 67.4s,
 * past the function ceiling. Each pass now carries its own budget, which is
 * correct because they are fetched independently and cached separately.
 */
const TOTAL_BUDGET_MS = 45_000

interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

interface OverpassResponse {
  elements?: OverpassElement[]
}

/**
 * Overpass QL is a query language, so anything interpolated into it is a
 * potential injection. Only numbers ever reach this function, and they are
 * re-checked here rather than trusted from the caller.
 */
function num(value: number): string {
  if (!Number.isFinite(value))
    throw new UpstreamError('Refusing to build a query from a non-finite number')
  return value.toFixed(6)
}

/** Tag names and values come from our own hardcoded taxonomy, never user input. */
const SAFE_TOKEN = /^[a-z0-9_:]+$/

/**
 * Collapse filters that share a tag into a single clause. Each clause is a
 * separate spatial scan for Overpass, so this is the difference between a query
 * that returns and one that times out.
 */
function mergeByTag(filters: readonly OsmFilter[]): OsmFilter[] {
  const merged = new Map<string, Set<string> | '*'>()

  for (const filter of filters) {
    const existing = merged.get(filter.tag)
    if (existing === '*') continue

    if (filter.values === '*') {
      merged.set(filter.tag, '*')
      continue
    }

    const set = existing ?? new Set<string>()
    for (const value of filter.values) set.add(value)
    merged.set(filter.tag, set)
  }

  return [...merged.entries()].map(([tag, values]) => ({
    tag,
    values: values === '*' ? ('*' as const) : [...values],
  }))
}

function clause(filter: OsmFilter, around: string): string {
  if (!SAFE_TOKEN.test(filter.tag)) return ''

  if (filter.values === '*') {
    return `nwr(${around})["${filter.tag}"];`
  }

  const values = filter.values.filter((value) => SAFE_TOKEN.test(value))
  if (values.length === 0) return ''

  return `nwr(${around})["${filter.tag}"~"^(${values.join('|')})$"];`
}

function buildQuery(center: LatLng, radiusM: number, filters: readonly OsmFilter[]): string {
  const around = `around:${num(radiusM)},${num(center.lat)},${num(center.lng)}`
  const body = mergeByTag(filters)
    .map((filter) => clause(filter, around))
    .filter(Boolean)
    .join('\n')

  return `[out:json][timeout:${OVERPASS_TIMEOUT_S}];\n(\n${body}\n);\nout center tags;`
}

/**
 * Run a query against whichever mirror answers first.
 *
 * An empty result counts as a failure worth asking someone else about, because
 * a mirror that only carries part of the planet answers 200 with nothing in it.
 * If every mirror agrees the area is empty, the empty answer is returned: some
 * places genuinely have nothing within a mile.
 */
const EMPTY_RESPONSE = 'Mirror returned no elements'

/**
 * Rotate the mirror list so a pass can lead with someone other than the primary.
 *
 * The 5-mile pass now runs after the page has already rendered, so it holds a
 * slot for a long time after the reader stops waiting for it. Since the primary
 * mirror allows two concurrent queries per IP, leaving both passes pointed at it
 * means one visitor's trailing wide query competes with the next visitor's near
 * query. Measured: a dense address that serves in 7.3s on its own took 33s while
 * a previous request's wide pass was still running. Leading the two passes with
 * different hosts spends the allowance of two rate limiters instead of one.
 */
const rotated = (offset: number): readonly string[] => [
  ...OVERPASS_MIRRORS.slice(offset),
  ...OVERPASS_MIRRORS.slice(0, offset),
]

async function runQuery(
  query: string,
  deadlineAt: number,
  mirrors: readonly string[] = OVERPASS_MIRRORS,
): Promise<OverpassElement[]> {
  let anyMirrorSaidEmpty = false

  try {
    return await hedgedRace(
      mirrors,
      async (endpoint) => {
        // Checked per mirror rather than per query, so the shared budget still
        // bounds a walk that fans out.
        const remainingMs = deadlineAt - Date.now()
        if (remainingMs <= 0) throw new UpstreamError('Overpass time budget exhausted')

        const response = await fetchJson<OverpassResponse>(endpoint, {
          revalidate: CACHE_SECONDS,
          timeoutMs: Math.min(REQUEST_TIMEOUT_MS, remainingMs),
          method: 'POST',
          body: new URLSearchParams({ data: query }).toString(),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })

        const elements = response.elements ?? []
        if (elements.length === 0) {
          anyMirrorSaidEmpty = true
          throw new UpstreamError(EMPTY_RESPONSE)
        }

        return elements
      },
      HEDGE_DELAY_MS,
    )
  } catch (error) {
    // Every mirror has now been tried. If at least one of them answered cleanly
    // and simply had nothing to report, believe it: plenty of addresses really
    // do have nothing within a mile.
    if (anyMirrorSaidEmpty) return []
    throw error
  }
}

/**
 * Tag keys worth keeping past this boundary.
 *
 * `out center tags` hands back every tag on every feature, and OSM features
 * carry a lot of them: opening hours, wheelchair access, phone numbers, address
 * components, half a dozen `name:<lang>` variants. Two consumers read raw tags
 * and between them they touch fifteen keys, so everything else is dead weight
 * that we would otherwise hold in memory and write into the cache entry.
 */
const RETAINED_TAG_KEYS: ReadonlySet<string> = new Set([...CLASSIFY_TAG_KEYS, ...SCENT_TAG_KEYS])

function retainedTags(tags: Record<string, string>): Record<string, string> {
  const kept: Record<string, string> = {}
  for (const key of Object.keys(tags)) {
    const value = tags[key]
    if (value !== undefined && RETAINED_TAG_KEYS.has(key)) kept[key] = value
  }
  return kept
}

function toFeature(element: OverpassElement, center: LatLng): TaggedFeature | null {
  // Nodes carry lat/lon directly; ways and relations come back with a bounding
  // box centre because the query asks for `out center`.
  const lat = element.lat ?? element.center?.lat
  const lng = element.lon ?? element.center?.lon
  if (typeof lat !== 'number' || typeof lng !== 'number') return null

  const tags = element.tags ?? {}

  return {
    id: `${element.type}/${element.id}`,
    // Read before the trim, since `name` is promoted to its own field and is
    // not one of the keys worth carrying around as a tag.
    name: tags.name ?? null,
    lat,
    lng,
    distanceM: haversineMeters(center, { lat, lng }),
    tags: retainedTags(tags),
  }
}

function dedupe(features: TaggedFeature[]): TaggedFeature[] {
  const seen = new Map<string, TaggedFeature>()
  for (const feature of features) {
    if (!seen.has(feature.id)) seen.set(feature.id, feature)
  }
  return [...seen.values()]
}

/**
 * How many close instances a category needs before a wider search would add
 * nothing. Mirrors the saturation constant in the scoring engine: three nearby
 * instances is full credit, so anything at or above that is already done.
 */
const SATURATED_COUNT = 3

export interface NearResult {
  /** Everything inside the walking radius, classified. Drives walk score + map. */
  nearPois: Poi[]
  /** Everything inside the walking radius including unclassified smell sources. */
  nearFeatures: TaggedFeature[]
}

export interface WideResult {
  /** Near POIs plus any wider results, for the driving score. */
  drivePois: Poi[]
  /** Categories the wide query actually had to go and fetch. */
  widenedCategories: CategoryKey[]
}

/**
 * The 1-mile pass. Powers the walking score, the scent profile and the map, and
 * is bounded in size everywhere.
 *
 * Everything on the report except the driving score comes from this, which is
 * why it is separated from the wide pass below: it is the fast half, and
 * waiting for the slow half before showing any of it was the whole cold-start
 * problem. Measured on the fastest mirror, this is 4.1s over a dense address
 * and 1.5s over a sparse one.
 */
export async function fetchNearPois(center: LatLng): Promise<NearResult> {
  const deadlineAt = Date.now() + TOTAL_BUDGET_MS

  const nearElements = await runQuery(
    buildQuery(center, WALK_RADIUS_M, NEAR_QUERY_FILTERS),
    deadlineAt,
  )

  const nearFeatures = dedupe(
    nearElements
      .map((element) => toFeature(element, center))
      .filter(
        (feature): feature is TaggedFeature =>
          feature !== null && feature.distanceM <= WALK_RADIUS_M,
      ),
  )

  const classified: Poi[] = []
  for (const feature of nearFeatures) {
    const category = classify(feature.tags)
    if (category) classified.push({ ...feature, category })
  }

  // Collapse the many polygons OSM uses for one real place before anything
  // counts them.
  return { nearPois: dedupePois(classified), nearFeatures }
}

/**
 * The 5-mile pass, for the driving score only.
 *
 * Goes wide only for categories the 1-mile pass left short. This is
 * self-balancing: downtown saturates almost every category inside a mile so
 * this asks for little or nothing, while a rural address triggers a wide query
 * that returns very few rows because the area really is empty. The expensive
 * case, dense *and* wide, is the one case that cannot happen.
 *
 * It is nonetheless the slow half, and irreducibly so. A sparse address widens
 * for almost every category, and that query measured 9.9s on the healthiest
 * mirror, 15.0s and 31.5s on the other two. Added to the near pass, a complete
 * report simply cannot come in under 10s for such an address, which is why the
 * caller renders without this and fills it in when it arrives.
 *
 * Splitting the clauses across mirrors to run them concurrently was measured
 * and rejected: it binds to the slowest mirror, so the same query split three
 * ways took 16.6s against 9.9s undivided. Running it alongside the near pass on
 * one host was measured and rejected too, because `/api/status` reports
 * `Rate limit: 2` and spending both slots on one report makes everything queue.
 */
export async function fetchDrivePois(
  center: LatLng,
  nearPois: readonly Poi[],
): Promise<WideResult> {
  const deadlineAt = Date.now() + TOTAL_BUDGET_MS

  // Which categories still look thin after the 1-mile pass?
  const counts = new Map<CategoryKey, number>()
  for (const poi of nearPois) counts.set(poi.category, (counts.get(poi.category) ?? 0) + 1)

  const widenedCategories = (Object.keys(WIDE_FILTERS) as CategoryKey[]).filter(
    (key) => (counts.get(key) ?? 0) < SATURATED_COUNT,
  )

  const unwidened: WideResult = { drivePois: [...nearPois], widenedCategories }

  if (widenedCategories.length === 0) return unwidened

  const wideFilters = widenedCategories.flatMap((key) => WIDE_FILTERS[key])

  try {
    // Leads with the second mirror so this trailing query stops competing with
    // the next visitor's 1-mile pass for the primary's two slots.
    const wideElements = await runQuery(
      buildQuery(center, DRIVE_RADIUS_M, wideFilters),
      deadlineAt,
      rotated(1),
    )

    const widePois: Poi[] = []
    for (const element of wideElements) {
      const feature = toFeature(element, center)
      if (!feature || feature.distanceM > DRIVE_RADIUS_M) continue
      const category = classify(feature.tags)
      if (category) widePois.push({ ...feature, category })
    }

    const merged = new Map<string, Poi>()
    for (const poi of [...nearPois, ...widePois]) merged.set(poi.id, poi)
    return { drivePois: dedupePois([...merged.values()]), widenedCategories }
  } catch {
    // The wide pass is an enhancement. If it fails, the driving score still
    // computes from the 1-mile set; it just reads lower than it should.
    return unwidened
  }
}
