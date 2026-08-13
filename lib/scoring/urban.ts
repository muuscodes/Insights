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
 * a dense inner-city neighbourhood approaches, without reaching, the top.
 *
 * The upper bounds used to be 800 and 30,000, and they were too low to be
 * calibration at all. One ordinary San Francisco address measured 854 amenities
 * and 35,817 residents per square mile, clearing both, so it pinned the index
 * at exactly 100 with nothing left to distinguish it from somewhere genuinely
 * denser. Manhattan tracts run past 70,000 residents per square mile, so the
 * ceiling has to sit above that for the top band to mean anything.
 */
const POI_PER_SQ_MI_MIN = 5
const POI_PER_SQ_MI_MAX = 2_500
const POP_PER_SQ_MI_MIN = 100
const POP_PER_SQ_MI_MAX = 80_000

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
  /**
   * True when the tract is Census special land use (codes 9800 to 9899): a
   * park, an airport, water, a big federal campus. Its population is close to
   * zero by definition and says nothing about the surrounding neighbourhood.
   */
  specialUseTract?: boolean
}

/**
 * Below this, a tract's residents-per-square-mile is treated as an artefact
 * rather than a description of the place. 1600 Pennsylvania Avenue sits in a
 * tract reporting 7 residents per square mile; averaging that against genuine
 * downtown amenity density produced "Suburban" for the middle of Washington DC.
 */
const IMPLAUSIBLE_POP_DENSITY = 50

export function computeUrbanIndex({
  poiCount,
  population,
  landAreaSqMi,
  specialUseTract = false,
}: UrbanIndexInput): UrbanIndex {
  const areaSqMi = circleAreaSqMi(WALK_RADIUS_MI)
  const poiPerSqMi = poiCount / areaSqMi
  const poiScore = normalizeLog(poiPerSqMi, POI_PER_SQ_MI_MIN, POI_PER_SQ_MI_MAX)

  const rawDensity =
    population !== null && landAreaSqMi !== null && landAreaSqMi > 0
      ? population / landAreaSqMi
      : null

  // Drop the residential signal when it cannot be believed: a special-use tract,
  // or a density so low it contradicts an obviously built-up surrounding.
  const populationUsable =
    rawDensity !== null &&
    population !== null &&
    population > 0 &&
    !specialUseTract &&
    !(rawDensity < IMPLAUSIBLE_POP_DENSITY && poiPerSqMi > POI_PER_SQ_MI_MIN * 4)

  const popPerSqMi = populationUsable ? rawDensity : null

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
