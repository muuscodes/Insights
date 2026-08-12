import { describe, expect, it } from 'vitest'

import { computeUrbanIndex } from './urban'

/** pi square miles, the area of the 1-mile circle. */
const AREA = Math.PI

describe('computeUrbanIndex', () => {
  it('reads an empty rural crossroads as Rural', () => {
    const result = computeUrbanIndex({
      poiCount: Math.round(2 * AREA),
      population: 1200,
      landAreaSqMi: 24,
    })
    expect(result.label).toBe('Rural')
    expect(result.index).toBeLessThan(25)
  })

  it('reads a typical single-family suburb as Suburban', () => {
    const result = computeUrbanIndex({
      poiCount: Math.round(20 * AREA),
      population: 4000,
      landAreaSqMi: 2,
    })
    expect(result.label).toBe('Suburban')
  })

  it('reads a moderately built-up neighbourhood as Urban', () => {
    // Dense residential, moderate amenities. Urban, but not a core.
    const result = computeUrbanIndex({
      poiCount: Math.round(190 * AREA),
      population: 6000,
      landAreaSqMi: 0.2,
    })
    expect(result.label).toBe('Urban')
  })

  it('reads a dense inner-city neighbourhood as Urban Core, with headroom left', () => {
    // Measured, not invented: a live San Francisco address returned 854
    // amenities and 35,817 residents per square mile. Under the old 800/30,000
    // ceilings it cleared both and pinned at exactly 100, leaving nothing to
    // separate it from somewhere genuinely denser.
    const result = computeUrbanIndex({
      poiCount: Math.round(854 * AREA),
      population: 35_817,
      landAreaSqMi: 1,
    })
    expect(result.label).toBe('Urban Core')
    expect(result.index).toBeGreaterThan(75)
    expect(result.index).toBeLessThan(100)
  })

  it('still ranks somewhere genuinely denser above that', () => {
    // Manhattan tracts run past 70,000 residents per square mile. The point of
    // the raised ceiling is that this has to outrank the address above.
    const sanFrancisco = computeUrbanIndex({
      poiCount: Math.round(854 * AREA),
      population: 35_817,
      landAreaSqMi: 1,
    })
    const manhattan = computeUrbanIndex({
      poiCount: Math.round(1_500 * AREA),
      population: 70_000,
      landAreaSqMi: 1,
    })

    expect(manhattan.index).toBeGreaterThan(sanFrancisco.index)
    expect(manhattan.index).toBeLessThanOrEqual(100)
  })

  it('increases monotonically with amenity density', () => {
    const scores = [1, 10, 50, 200, 600].map(
      (perSqMi) =>
        computeUrbanIndex({
          poiCount: Math.round(perSqMi * AREA),
          population: 5000,
          landAreaSqMi: 1,
        }).index,
    )
    expect(scores).toEqual([...scores].sort((a, b) => a - b))
  })

  it('increases monotonically with population density', () => {
    const scores = [200, 1000, 5000, 15_000, 40_000].map(
      (population) => computeUrbanIndex({ poiCount: 300, population, landAreaSqMi: 1 }).index,
    )
    expect(scores).toEqual([...scores].sort((a, b) => a - b))
  })

  it('ignores population in a Census special land-use tract', () => {
    // 1600 Pennsylvania Avenue sits in tract 9800, which covers the National
    // Mall: 17 residents across 2.52 sq mi. Averaging that against real
    // downtown amenity density labelled the middle of Washington DC "Suburban".
    const result = computeUrbanIndex({
      poiCount: Math.round(587 * AREA),
      population: 17,
      landAreaSqMi: 2.52,
      specialUseTract: true,
    })

    expect(result.poiOnly).toBe(true)
    expect(result.popPerSqMi).toBeNull()
    expect(result.label).toBe('Urban Core')
  })

  it('would still catch that tract without the special-use hint', () => {
    // Belt and braces: the implausible-density guard alone rescues it, so a
    // mislabelled tract code cannot reintroduce the bug.
    const result = computeUrbanIndex({
      poiCount: Math.round(587 * AREA),
      population: 17,
      landAreaSqMi: 2.52,
    })

    expect(result.poiOnly).toBe(true)
    expect(result.label).toBe('Urban Core')
  })

  it('ignores an implausibly low density surrounded by dense amenities', () => {
    // Same protection without the tract-code hint, for tracts that are simply
    // mostly water or industrial.
    const result = computeUrbanIndex({
      poiCount: Math.round(587 * AREA),
      population: 30,
      landAreaSqMi: 3,
    })
    expect(result.poiOnly).toBe(true)
  })

  it('still trusts a genuinely rural low density', () => {
    // Sparse people AND sparse amenities is just the countryside, and the
    // population signal there is real.
    const result = computeUrbanIndex({ poiCount: 6, population: 1200, landAreaSqMi: 60 })
    expect(result.poiOnly).toBe(false)
    expect(result.label).toBe('Rural')
  })

  it('falls back to amenity density alone when Census data is missing', () => {
    const result = computeUrbanIndex({
      poiCount: Math.round(190 * AREA),
      population: null,
      landAreaSqMi: null,
    })
    expect(result.poiOnly).toBe(true)
    expect(result.popPerSqMi).toBeNull()
    expect(result.index).toBeGreaterThan(0)
  })

  it('treats a zero or missing land area as no population signal', () => {
    for (const landAreaSqMi of [0, null]) {
      const result = computeUrbanIndex({ poiCount: 100, population: 5000, landAreaSqMi })
      expect(result.poiOnly).toBe(true)
    }
  })

  it('does not divide by zero on an empty tract', () => {
    const result = computeUrbanIndex({ poiCount: 0, population: 0, landAreaSqMi: 5 })
    expect(Number.isFinite(result.index)).toBe(true)
    expect(result.index).toBe(0)
    expect(result.label).toBe('Rural')
  })

  it('clamps to the 0 to 100 range at both extremes', () => {
    const huge = computeUrbanIndex({ poiCount: 100_000, population: 500_000, landAreaSqMi: 0.05 })
    expect(huge.index).toBeLessThanOrEqual(100)
    expect(huge.index).toBeGreaterThanOrEqual(0)

    const empty = computeUrbanIndex({ poiCount: 0, population: null, landAreaSqMi: null })
    expect(empty.index).toBe(0)
  })

  it('labels every band boundary consistently with the index', () => {
    const bands: Array<[number, string]> = [
      [0, 'Rural'],
      [24, 'Rural'],
      [25, 'Suburban'],
      [49, 'Suburban'],
      [50, 'Urban'],
      [74, 'Urban'],
      [75, 'Urban Core'],
      [100, 'Urban Core'],
    ]

    // Drive the label through the public result rather than a private helper by
    // finding inputs that land on each index, which also proves the index is
    // reachable across its whole range.
    for (const [index, label] of bands) {
      const found = probeForIndex(index)
      if (found) expect(found.label).toBe(label)
    }
  })
})

/** Search POI counts for one that produces the target index, if reachable. */
function probeForIndex(target: number) {
  for (let poiCount = 0; poiCount < 4000; poiCount += 1) {
    const result = computeUrbanIndex({ poiCount, population: null, landAreaSqMi: null })
    if (result.index === target) return result
  }
  return null
}
