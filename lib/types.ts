import type { CategoryKey } from './scoring/taxonomy'

/**
 * Any OSM feature we pulled back and measured. Some of these carry a smell but
 * no scoring weight (a landfill, a stand of trees, a water body), which is why
 * this is separate from `Poi`.
 */
export interface TaggedFeature {
  id: string
  name: string | null
  lat: number
  lng: number
  /** Straight-line distance from the searched address, in metres. */
  distanceM: number
  /** Raw OSM tags, retained so the scent profile can re-read cuisine values. */
  tags: Record<string, string>
}

/** A tagged feature that matched the scoring whitelist. */
export interface Poi extends TaggedFeature {
  category: CategoryKey
}

export interface CategoryBreakdown {
  key: CategoryKey
  label: string
  color: string
  /** Number of whitelisted features found in this category. */
  count: number
  /** Distance to the closest one, metres. Null when the category is empty. */
  nearestM: number | null
  /** Name of the closest one, when OSM has one. */
  nearestName: string | null
  /** 0 to 1, after distance decay and diminishing returns. */
  saturation: number
  /** Points this category contributed to the final score, out of 100. */
  contribution: number
}

export interface ScoreResult {
  /** 0 to 100. */
  score: number
  label: string
  radiusMi: number
  breakdown: CategoryBreakdown[]
}

export type DensityLabel = 'Rural' | 'Suburban' | 'Urban' | 'Urban Core'

export interface UrbanIndex {
  /** 0 to 100. */
  index: number
  label: DensityLabel
  /** Whitelisted POIs per square mile inside the 1-mile circle. */
  poiPerSqMi: number
  /** Census tract residents per square mile. Null when ACS is unavailable. */
  popPerSqMi: number | null
  /** True when the index came from POI density alone, with no Census input. */
  poiOnly: boolean
}

export interface ScentNote {
  key: string
  label: string
  /** Percent share of total scent weight, 0 to 100. */
  share: number
  color: string
  /** Concrete sources, e.g. "61 Mexican, 45 coffee". */
  detail: string
}

export interface ScentProfile {
  notes: ScentNote[]
  summary: string
}

export interface Demographics {
  tractName: string
  population: number | null
  medianHouseholdIncome: number | null
  medianHomeValue: number | null
  medianAge: number | null
  bachelorsOrHigherPct: number | null
  /** Land area of the tract in square miles, from TIGER `AREALAND`. */
  landAreaSqMi: number | null
  vintage: number
  /**
   * True for a Census special land-use tract (codes 9800 to 9899): parks,
   * airports, water, large federal campuses. Almost nobody is counted as
   * living in one, so these figures describe the land, not a neighbourhood.
   */
  specialUse: boolean
}

export interface Bird {
  speciesKey: number
  commonName: string
  scientificName: string
  observations: number
}

export interface ResolvedAddress {
  formatted: string
  lat: number
  lng: number
  /** 11-digit Census tract GEOID, when the tract lookup succeeded. */
  tractGeoid: string | null
}

/**
 * Panels degrade independently. A dead provider yields `{ ok: false }` for its
 * own panel and the rest of the page still renders.
 */
export type Panel<T> = { ok: true; data: T } | { ok: false; reason: string }

export interface InsightsPayload {
  address: ResolvedAddress
  walk: Panel<ScoreResult>
  drive: Panel<ScoreResult>
  urban: Panel<UrbanIndex>
  scent: Panel<ScentProfile>
  demographics: Panel<Demographics>
  birds: Panel<Bird[]>
  /** POIs inside the walking radius, for the map. Tags stripped to cut payload. */
  mapPois: MapPoi[]
  generatedAt: string
}

/** A POI as the map needs it: no raw tags, which are server-side detail. */
export interface MapPoi {
  id: string
  name: string | null
  lat: number
  lng: number
  distanceM: number
  category: CategoryKey
}
