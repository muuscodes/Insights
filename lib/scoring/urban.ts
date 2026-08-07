import { WALK_RADIUS_MI, circleAreaSqMi } from '../geo'
import type { DensityLabel, UrbanIndex } from '../types'

/**
 * Urban / Suburban Index.
 *
 * Built from two real measurements rather than a vibe:
 *
 *   1. Amenity density, from the whitelisted POI count inside the 1-mile
 *      circle (pi square miles).
 *   2. Residential density, from ACS population divided by the tract's
 *      `AREALAND`, which the Census geographies response hands back directly.
 *
 * Two inputs matter because either one alone misleads. A downtown core has
 * enormous amenity density but few residents, and a dense residential suburb
 * has plenty of residents but almost no amenities. Averaging them puts both
 * kinds of place where a person would expect.
 */

/** Density is roughly log-normal across US neighbourhoods, so normalise on a log scale. */
function normalizeLog(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  const lo = Math.log10(min + 1)
  const hi = Math.log10(max + 1)
  if (hi <= lo) return 0
  const t = (Math.log10(value + 1) - lo) / (hi - lo)
  return Math.min(1, Math.max(0, t))
}

/**
 * Calibration bounds. Chosen so that a quiet rural crossroads lands near 0, a
 * typical single-family suburb lands near the middle of the Suburban band, and
 * a dense inner-city neighbourhood saturates.
 */
const POI_PER_SQ_MI_MIN = 5
const POI_PER_SQ_MI_MAX = 800
const POP_PER_SQ_MI_MIN = 100
const POP_PER_SQ_MI_MAX = 30_000

function labelFor(index: number): DensityLabel {
  if (index < 25) return 'Rural'
  if (index < 50) return 'Suburban'
  if (index < 75) return 'Urban'
  return 'Urban Core'
}

export interface UrbanIndexInput {
  /** Whitelisted POIs inside the walking radius. */
  poiCount: number
  /** ACS tract population. Null when the Census API was unavailable. */
  population: number | null
  /** Tract land area in square miles, from TIGER `AREALAND`. */
  landAreaSqMi: number | null
}

export function computeUrbanIndex({
  poiCount,
  population,
  landAreaSqMi,
}: UrbanIndexInput): UrbanIndex {
  const areaSqMi = circleAreaSqMi(WALK_RADIUS_MI)
  const poiPerSqMi = poiCount / areaSqMi
  const poiScore = normalizeLog(poiPerSqMi, POI_PER_SQ_MI_MIN, POI_PER_SQ_MI_MAX)

  const hasPop =
    population !== null && landAreaSqMi !== null && population > 0 && landAreaSqMi > 0

  const popPerSqMi = hasPop ? population / landAreaSqMi : null

  // With no Census input, fall back to amenity density alone and say so, rather
  // than silently reporting a number built from half the evidence.
  const index =
    popPerSqMi === null
      ? poiScore * 100
      : (poiScore + normalizeLog(popPerSqMi, POP_PER_SQ_MI_MIN, POP_PER_SQ_MI_MAX)) * 50

  const rounded = Math.round(Math.min(100, Math.max(0, index)))

  return {
    index: rounded,
    label: labelFor(rounded),
    poiPerSqMi: Math.round(poiPerSqMi),
    popPerSqMi: popPerSqMi === null ? null : Math.round(popPerSqMi),
    poiOnly: popPerSqMi === null,
  }
}
