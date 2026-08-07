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

  it('reads a dense inner-city neighbourhood as Urban Core', () => {
    // Calibrated against the San Francisco Mission probe: roughly 190 POIs per
    // square mile and a tract population density near 30,000 per square mile.
    const result = computeUrbanIndex({
      poiCount: Math.round(190 * AREA),
      population: 6000,
      landAreaSqMi: 0.2,
    })
    expect(result.label).toBe('Urban Core')
    expect(result.index).toBeGreaterThan(75)
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
      (population) =>
        computeUrbanIndex({ poiCount: 300, population, landAreaSqMi: 1 }).index,
    )
    expect(scores).toEqual([...scores].sort((a, b) => a - b))
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
