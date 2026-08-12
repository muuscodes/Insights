import 'server-only'

import { DRIVE_RADIUS_M, WALK_RADIUS_M, haversineMeters, type LatLng } from '../geo'
import { UpstreamError, fetchJson, firstSuccessful } from '../http'
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
 * down a mirror list and the queries themselves are shaped to be cheap. A
 * 24 hour cache means a given address pays this cost once.
 */

const CACHE_SECONDS = 60 * 60 * 24

/**
 * Deliberately shorter than it could be. Measured on healthy instances, the
 * 1-mile query takes about 7 seconds and the 5-mile one about 18. Anything past
 * 25 means that instance is overloaded, and moving to the next mirror beats
 * waiting: a 45 second timeout turned one slow mirror into a 106 second page.
 */
const REQUEST_TIMEOUT_MS = 25_000
const OVERPASS_TIMEOUT_S = 25

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
 * Run a query, moving to the next mirror on failure.
 *
 * An empty result also counts as a failure worth retrying elsewhere, because a
 * mirror that only carries part of the planet answers 200 with nothing in it.
 * If every mirror agrees the area is empty, the empty answer is returned: some
 * places genuinely have nothing within a mile.
 */
const EMPTY_RESPONSE = 'Mirror returned no elements'

async function runQuery(query: string): Promise<OverpassElement[]> {
  let anyMirrorSaidEmpty = false

  try {
    return await firstSuccessful(OVERPASS_MIRRORS, async (endpoint) => {
      const response = await fetchJson<OverpassResponse>(endpoint, {
        revalidate: CACHE_SECONDS,
        timeoutMs: REQUEST_TIMEOUT_MS,
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
    })
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

export interface OverpassResult {
  /** Everything inside the walking radius, classified. Drives walk score + map. */
  nearPois: Poi[]
  /** Everything inside the walking radius including unclassified smell sources. */
  nearFeatures: TaggedFeature[]
  /** Near POIs plus any wider results, for the driving score. */
  drivePois: Poi[]
  /** Categories the wide query actually had to go and fetch. */
  widenedCategories: CategoryKey[]
}

/**
 * Fetch POIs for one address.
 *
 * Two stages, because a naive 5-mile query does not survive contact with a
 * dense city. A measured 5-mile whitelist query around Times Square returned
 * 31,785 elements and 10.9 MB in 36 seconds.
 *
 *   Stage 1 pulls the full 1-mile set. It powers the walking score, the scent
 *   profile and the map, and it is bounded in size everywhere.
 *
 *   Stage 2 goes out to 5 miles, but only for categories that stage 1 left
 *   short. This is self-balancing: downtown saturates almost every category
 *   inside a mile so stage 2 asks for little or nothing, while a rural address
 *   triggers a wide query that returns very few rows because the area really is
 *   empty. The expensive case, dense *and* wide, is the one case that cannot
 *   happen.
 */
export async function fetchPois(center: LatLng): Promise<OverpassResult> {
  const nearElements = await runQuery(buildQuery(center, WALK_RADIUS_M, NEAR_QUERY_FILTERS))

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
  const nearPois = dedupePois(classified)

  // Which categories still look thin after the 1-mile pass?
  const counts = new Map<CategoryKey, number>()
  for (const poi of nearPois) counts.set(poi.category, (counts.get(poi.category) ?? 0) + 1)

  const widenedCategories = (Object.keys(WIDE_FILTERS) as CategoryKey[]).filter(
    (key) => (counts.get(key) ?? 0) < SATURATED_COUNT,
  )

  let drivePois = nearPois

  if (widenedCategories.length > 0) {
    const wideFilters = widenedCategories.flatMap((key) => WIDE_FILTERS[key])

    try {
      const wideElements = await runQuery(buildQuery(center, DRIVE_RADIUS_M, wideFilters))

      const widePois: Poi[] = []
      for (const element of wideElements) {
        const feature = toFeature(element, center)
        if (!feature || feature.distanceM > DRIVE_RADIUS_M) continue
        const category = classify(feature.tags)
        if (category) widePois.push({ ...feature, category })
      }

      const merged = new Map<string, Poi>()
      for (const poi of [...nearPois, ...widePois]) merged.set(poi.id, poi)
      drivePois = dedupePois([...merged.values()])
    } catch {
      // The wide pass is an enhancement. If it fails, the driving score still
      // computes from the 1-mile set; it just reads lower than it should.
      drivePois = nearPois
    }
  }

  return { nearPois, nearFeatures, drivePois, widenedCategories }
}
