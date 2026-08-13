import { DRIVE_RADIUS_MI, WALK_RADIUS_MI, METERS_PER_MILE } from '../geo'
import type { CategoryBreakdown, Poi, ScoreResult } from '../types'
import { CATEGORIES, type CategoryDef, type CategoryKey } from './taxonomy'

export type Mode = 'walk' | 'drive'

/**
 * Fraction of the radius that earns undiminished credit. At the 1-mile walking
 * radius this is a quarter mile, roughly a five minute walk, which is the
 * threshold Walk Score uses for full points.
 */
const FULL_CREDIT_FRACTION = 0.25

/**
 * Distance decay: full credit out to a quarter of the radius, then straight
 * down to zero at the edge.
 *
 * Linear rather than exponential on purpose. Walking utility genuinely is not
 * binary at a radius edge, but the brief explicitly asks for simple, defensible
 * heuristics over false precision, and a straight line is trivial to explain
 * and to test.
 */
export function decay(distanceM: number, radiusM: number): number {
  if (radiusM <= 0) return 0
  if (distanceM <= 0) return 1

  const fullCreditM = radiusM * FULL_CREDIT_FRACTION
  if (distanceM <= fullCreditM) return 1
  if (distanceM >= radiusM) return 0

  return 1 - (distanceM - fullCreditM) / (radiusM - fullCreditM)
}

/** Only the nearest few in a category matter; past this they are all noise. */
const MAX_INSTANCES_PER_CATEGORY = 10

/**
 * Diminishing returns within a category. The nearest counts fully, the second
 * half as much, the third a quarter, and so on. The 300th restaurant should
 * not move the number, and in dense cities there really are 300.
 */
function instanceWeight(rank: number): number {
  return Math.pow(0.5, rank)
}

/**
 * Credit at which a category is considered fully served: three instances at
 * close range (1 + 0.5 + 0.25). Beyond that the category is saturated and
 * additional options add nothing.
 */
const CATEGORY_SATURATION = 1.75

/**
 * Share of a saturated category's credit that depends on how close its nearest
 * instance actually is.
 *
 * Without this the top of the scale is dead. Three instances inside the
 * quarter-mile full-credit zone saturates a category, and a dense address has
 * hundreds, so every category pins at 1.0 and the total pins at 100. A measured
 * San Francisco address scored 100 on walking, 100 on driving and 100 on the
 * urban index, which makes it indistinguishable from Midtown Manhattan.
 *
 * `decay` deliberately treats everything inside 402 m as equally convenient,
 * which is right for the main signal: a five minute walk is a five minute walk.
 * But once a category is saturated that is the only thing left to separate two
 * addresses, and a grocery at 30 m genuinely does beat one at 390 m. This
 * reserves a small slice of each category for that, so a perfect 100 now means
 * everything is not merely present but close.
 */
const PROXIMITY_SHARE = 0.12

/**
 * Score bands, high to low. One list so the wording and the colour cannot drift
 * apart: they did, and a 45 rendered in the encouraging yellow directly beneath
 * the words "Most trips need a car".
 */
export const SCORE_BANDS = [
  { min: 90, label: "Everything's here", tone: 'good' },
  { min: 70, label: 'Very convenient', tone: 'good' },
  { min: 50, label: 'Some errands work', tone: 'mixed' },
  { min: 25, label: 'Most trips need a car', tone: 'poor' },
  { min: 0, label: 'Car required', tone: 'poor' },
] as const satisfies ReadonlyArray<{ min: number; label: string; tone: ScoreTone }>

export type ScoreTone = 'good' | 'mixed' | 'poor'

export function scoreBand(score: number): (typeof SCORE_BANDS)[number] {
  // The last band starts at 0, so this only falls through for a negative score,
  // which `scoreMode` already clamps away.
  return SCORE_BANDS.find((band) => score >= band.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1]!
}

export function scoreLabel(score: number): string {
  return scoreBand(score).label
}

/**
 * Score a set of POIs for one travel mode.
 *
 * Shape of the calculation:
 *   1. Bucket POIs into whitelisted categories, ignoring street furniture.
 *   2. Within each category, take the nearest N and sum
 *      `decay(distance) * instanceWeight(rank)`.
 *   3. Divide by the saturation constant and clamp, giving 0 to 1 per category.
 *   4. Combine categories by mode weight, normalised against the theoretical
 *      maximum, so breadth of amenity types beats raw volume in one category.
 */
export function scoreMode(pois: readonly Poi[], mode: Mode): ScoreResult {
  const radiusMi = mode === 'walk' ? WALK_RADIUS_MI : DRIVE_RADIUS_MI
  const radiusM = radiusMi * METERS_PER_MILE
  const weightOf = (c: CategoryDef): number => (mode === 'walk' ? c.walkWeight : c.driveWeight)

  const byCategory = new Map<CategoryKey, Poi[]>()
  for (const poi of pois) {
    if (poi.distanceM > radiusM) continue
    const bucket = byCategory.get(poi.category)
    if (bucket) bucket.push(poi)
    else byCategory.set(poi.category, [poi])
  }

  const maxTotal = CATEGORIES.reduce((sum, c) => sum + weightOf(c), 0)
  const breakdown: CategoryBreakdown[] = []
  let total = 0

  for (const category of CATEGORIES) {
    const weight = weightOf(category)
    const found = (byCategory.get(category.key) ?? []).sort((a, b) => a.distanceM - b.distanceM)

    let raw = 0
    for (let rank = 0; rank < Math.min(found.length, MAX_INSTANCES_PER_CATEGORY); rank++) {
      // Guarded by the loop bound, but noUncheckedIndexedAccess wants proof.
      const poi = found[rank]
      if (!poi) continue
      raw += decay(poi.distanceM, radiusM) * instanceWeight(rank)
    }

    const saturation = Math.min(raw / CATEGORY_SATURATION, 1)
    const nearest = found[0]

    // 1 at the doorstep, 0 at the full-credit threshold and anywhere past it.
    const fullCreditM = radiusM * FULL_CREDIT_FRACTION
    const proximity = nearest ? Math.max(0, 1 - nearest.distanceM / fullCreditM) : 0

    const effective = saturation * (1 - PROXIMITY_SHARE + PROXIMITY_SHARE * proximity)
    const contribution = maxTotal > 0 ? (effective * weight * 100) / maxTotal : 0
    total += contribution

    breakdown.push({
      key: category.key,
      label: category.label,
      color: category.color,
      count: found.length,
      nearestM: nearest ? nearest.distanceM : null,
      nearestName: nearest?.name ?? null,
      saturation,
      contribution,
    })
  }

  const score = Math.round(Math.min(100, Math.max(0, total)))

  return {
    score,
    label: scoreLabel(score),
    radiusMi,
    breakdown: breakdown.sort((a, b) => b.contribution - a.contribution),
  }
}
