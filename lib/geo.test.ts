import { describe, expect, it } from 'vitest'

import {
  METERS_PER_MILE,
  circleAreaSqMi,
  formatCoordParam,
  formatDistance,
  haversineMeters,
  metersToMiles,
  parseCoordParam,
  sqMetersToSqMiles,
  walkMinutes,
} from './geo'

describe('haversineMeters', () => {
  it('is zero for the same point', () => {
    expect(haversineMeters({ lat: 38.9, lng: -77 }, { lat: 38.9, lng: -77 })).toBe(0)
  })

  it('matches a known distance', () => {
    // White House to the Washington Monument, about 1.14 km.
    const distance = haversineMeters(
      { lat: 38.8977, lng: -77.0365 },
      { lat: 38.8895, lng: -77.0353 },
    )
    expect(distance).toBeGreaterThan(900)
    expect(distance).toBeLessThan(1000)
  })

  it('matches a long known distance', () => {
    // Los Angeles to New York, about 2,445 miles great-circle.
    const miles = metersToMiles(
      haversineMeters({ lat: 34.0522, lng: -118.2437 }, { lat: 40.7128, lng: -74.006 }),
    )
    expect(miles).toBeGreaterThan(2435)
    expect(miles).toBeLessThan(2455)
  })

  it('is symmetric', () => {
    const a = { lat: 40.7, lng: -74 }
    const b = { lat: 34.05, lng: -118.24 }
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6)
  })

  it('handles antimeridian-adjacent points without blowing up', () => {
    const distance = haversineMeters({ lat: 0, lng: 179.9 }, { lat: 0, lng: -179.9 })
    // Should be the short way round, about 22 km, not most of the planet.
    expect(distance).toBeLessThan(30_000)
  })
})

describe('unit conversions', () => {
  it('converts miles to metres consistently', () => {
    expect(metersToMiles(METERS_PER_MILE)).toBeCloseTo(1, 10)
  })

  it('converts square metres to square miles', () => {
    expect(sqMetersToSqMiles(METERS_PER_MILE ** 2)).toBeCloseTo(1, 10)
  })

  it('computes the area of the one mile circle', () => {
    expect(circleAreaSqMi(1)).toBeCloseTo(Math.PI, 10)
  })
})

describe('formatDistance', () => {
  it('uses feet under a quarter mile', () => {
    expect(formatDistance(100)).toMatch(/ft$/)
  })

  it('uses miles at and above a quarter mile', () => {
    expect(formatDistance(METERS_PER_MILE / 2)).toBe('0.5 mi')
  })
})

describe('walkMinutes', () => {
  it('never reports zero minutes', () => {
    expect(walkMinutes(5)).toBe(1)
  })

  it('scales with distance', () => {
    expect(walkMinutes(METERS_PER_MILE)).toBeGreaterThan(15)
    expect(walkMinutes(METERS_PER_MILE)).toBeLessThan(25)
  })
})

describe('coordinate URL encoding', () => {
  it('round-trips', () => {
    const original = { lat: 38.8976387, lng: -77.0365525 }
    const parsed = parseCoordParam(formatCoordParam(original))
    expect(parsed?.lat).toBeCloseTo(original.lat, 5)
    expect(parsed?.lng).toBeCloseTo(original.lng, 5)
  })

  it('emits a stable six-decimal form so cache keys stay stable', () => {
    expect(formatCoordParam({ lat: 38.9, lng: -77 })).toBe('38.900000,-77.000000')
  })

  it('accepts an encoded comma', () => {
    expect(parseCoordParam('38.900000%2C-77.000000')).toEqual({ lat: 38.9, lng: -77 })
  })

  it.each([
    ['empty', ''],
    ['single value', '38.9'],
    ['three values', '38.9,-77,12'],
    ['not a number', 'abc,def'],
    ['hex literal', '0x1e,-77'],
    ['infinity', 'Infinity,-77'],
    ['latitude out of range', '91,-77'],
    ['longitude out of range', '38.9,-181'],
    ['injection attempt', "38.9,-77');drop"],
    ['whitespace padded number', '38.9, -77'],
  ])('rejects %s', (_label, input) => {
    expect(parseCoordParam(input)).toBeNull()
  })

  it('accepts the exact range boundaries', () => {
    expect(parseCoordParam('90,180')).toEqual({ lat: 90, lng: 180 })
    expect(parseCoordParam('-90,-180')).toEqual({ lat: -90, lng: -180 })
  })
})
