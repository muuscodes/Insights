import { describe, expect, it } from 'vitest'

import { METERS_PER_MILE } from '../geo'
import { poi } from '@/test/fixtures'
import { decay, scoreMode } from './score'

const WALK_M = METERS_PER_MILE
const DRIVE_M = 5 * METERS_PER_MILE

describe('decay', () => {
  it('gives full credit inside a quarter of the radius', () => {
    expect(decay(0, WALK_M)).toBe(1)
    expect(decay(WALK_M * 0.1, WALK_M)).toBe(1)
    expect(decay(WALK_M * 0.25, WALK_M)).toBe(1)
  })

  it('gives no credit at or beyond the radius', () => {
    expect(decay(WALK_M, WALK_M)).toBe(0)
    expect(decay(WALK_M * 2, WALK_M)).toBe(0)
  })

  it('falls off linearly between the two', () => {
    // Halfway between the quarter-mile mark and the edge.
    const midpoint = WALK_M * 0.25 + (WALK_M - WALK_M * 0.25) / 2
    expect(decay(midpoint, WALK_M)).toBeCloseTo(0.5, 6)
  })

  it('is monotonically non-increasing', () => {
    let previous = 1
    for (let d = 0; d <= WALK_M; d += WALK_M / 40) {
      const value = decay(d, WALK_M)
      expect(value).toBeLessThanOrEqual(previous + 1e-9)
      previous = value
    }
  })

  it('is safe for a zero or negative radius', () => {
    expect(decay(100, 0)).toBe(0)
    expect(decay(100, -5)).toBe(0)
  })
})

describe('scoreMode', () => {
  it('scores an empty neighbourhood at zero', () => {
    const result = scoreMode([], 'walk')
    expect(result.score).toBe(0)
    expect(result.label).toBe('Car required')
    expect(result.breakdown.every((row) => row.count === 0)).toBe(true)
  })

  it('rewards variety over volume', () => {
    // Three hundred restaurants on the doorstep, and nothing else.
    const monoculture = Array.from({ length: 300 }, () => poi({ amenity: 'restaurant' }, 100))

    // One of each of six different kinds of destination, same distance.
    const varied = [
      poi({ shop: 'supermarket' }, 100),
      poi({ amenity: 'restaurant' }, 100),
      poi({ amenity: 'cafe' }, 100),
      poi({ leisure: 'park' }, 100),
      poi({ amenity: 'pharmacy' }, 100),
      poi({ highway: 'bus_stop' }, 100),
    ]

    expect(scoreMode(varied, 'walk').score).toBeGreaterThan(scoreMode(monoculture, 'walk').score)
  })

  it('applies diminishing returns inside a category', () => {
    const one = scoreMode([poi({ amenity: 'restaurant' }, 100)], 'walk').score
    const three = scoreMode(
      Array.from({ length: 3 }, () => poi({ amenity: 'restaurant' }, 100)),
      'walk',
    ).score
    const fifty = scoreMode(
      Array.from({ length: 50 }, () => poi({ amenity: 'restaurant' }, 100)),
      'walk',
    ).score

    expect(three).toBeGreaterThan(one)
    // Past saturation the category is capped, so 50 is worth exactly what 3 is.
    expect(fifty).toBe(three)
  })

  it('prefers closer amenities', () => {
    const near = scoreMode([poi({ shop: 'supermarket' }, 100)], 'walk').score
    const far = scoreMode([poi({ shop: 'supermarket' }, WALK_M * 0.9)], 'walk').score
    expect(near).toBeGreaterThan(far)
  })

  it('excludes anything past the radius', () => {
    const result = scoreMode([poi({ shop: 'supermarket' }, WALK_M + 1)], 'walk')
    expect(result.score).toBe(0)
    expect(result.breakdown.find((row) => row.key === 'grocery')?.count).toBe(0)
  })

  it('stays within 0 and 100 even when saturated everywhere', () => {
    const oneOfEach: Record<string, string>[] = [
      { shop: 'supermarket' },
      { amenity: 'restaurant' },
      { amenity: 'cafe' },
      { shop: 'clothes' },
      { amenity: 'bank' },
      { amenity: 'school' },
      { leisure: 'park' },
      { amenity: 'pharmacy' },
      { highway: 'bus_stop' },
      { amenity: 'bar' },
    ]
    const everything = oneOfEach.flatMap((tags) =>
      Array.from({ length: 10 }, () => poi(tags, 10)),
    )

    const result = scoreMode(everything, 'walk')
    expect(result.score).toBe(100)
    expect(result.label).toBe("Everything's here")
  })

  it('uses a wider radius when driving', () => {
    expect(scoreMode([], 'walk').radiusMi).toBe(1)
    expect(scoreMode([], 'drive').radiusMi).toBe(5)
  })

  it('counts a destination three miles out only when driving', () => {
    const distant = [poi({ shop: 'supermarket' }, 3 * METERS_PER_MILE)]
    expect(scoreMode(distant, 'walk').score).toBe(0)
    expect(scoreMode(distant, 'drive').score).toBeGreaterThan(0)
  })

  it('weights cafes down and big destinations up when driving', () => {
    const cafes = Array.from({ length: 5 }, () => poi({ amenity: 'cafe' }, 500))
    const groceries = Array.from({ length: 5 }, () => poi({ shop: 'supermarket' }, 500))

    const cafeWalk = scoreMode(cafes, 'walk').score
    const cafeDrive = scoreMode(cafes, 'drive').score
    expect(cafeDrive).toBeLessThan(cafeWalk)

    // Groceries matter in both modes, so the gap should be far smaller.
    const groceryWalk = scoreMode(groceries, 'walk').score
    const groceryDrive = scoreMode(groceries, 'drive').score
    expect(Math.abs(groceryDrive - groceryWalk)).toBeLessThan(cafeWalk - cafeDrive)
  })

  it('reports the nearest instance per category', () => {
    const result = scoreMode(
      [
        poi({ shop: 'supermarket', name: 'Far Market' }, 900),
        poi({ shop: 'supermarket', name: 'Near Market' }, 120),
      ],
      'walk',
    )

    const grocery = result.breakdown.find((row) => row.key === 'grocery')
    expect(grocery?.nearestM).toBe(120)
    expect(grocery?.nearestName).toBe('Near Market')
    expect(grocery?.count).toBe(2)
  })

  it('orders the breakdown by contribution', () => {
    const result = scoreMode(
      [poi({ shop: 'supermarket' }, 50), poi({ amenity: 'cafe' }, 900)],
      'walk',
    )
    const contributions = result.breakdown.map((row) => row.contribution)
    expect(contributions).toEqual([...contributions].sort((a, b) => b - a))
  })

  it('never exceeds the drive radius', () => {
    expect(scoreMode([poi({ shop: 'supermarket' }, DRIVE_M + 1)], 'drive').score).toBe(0)
  })
})
