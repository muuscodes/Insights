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

export function scoreLabel(score: number): string {
  if (score >= 90) return "Everything's here"
  if (score >= 70) return 'Very convenient'
  if (score >= 50) return 'Some errands work'
  if (score >= 25) return 'Most trips need a car'
  return 'Car required'
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
    const contribution = maxTotal > 0 ? (saturation * weight * 100) / maxTotal : 0
    total += contribution

    const nearest = found[0]
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
