import { describe, expect, it } from 'vitest'

import { feature } from '@/test/fixtures'
import { computeScentProfile } from './scent'

describe('computeScentProfile', () => {
  it('returns a quiet reading with nothing nearby', () => {
    const profile = computeScentProfile([])
    expect(profile.notes).toEqual([])
    expect(profile.summary).toMatch(/quiet/i)
  })

  it('ignores sources beyond the half-mile scent radius', () => {
    const profile = computeScentProfile([feature({ amenity: 'restaurant' }, 5000)])
    expect(profile.notes).toEqual([])
  })

  it('weights a landfill far above a florist', () => {
    const dump = computeScentProfile([feature({ landuse: 'landfill' }, 100)])
    const flowers = computeScentProfile([feature({ shop: 'florist' }, 100)])

    // Each is alone, so each is 100 percent of its own profile. Compare by
    // putting them side by side instead.
    const both = computeScentProfile([
      feature({ landuse: 'landfill' }, 100),
      feature({ shop: 'florist' }, 100),
    ])

    expect(dump.notes[0]?.key).toBe('funk')
    expect(flowers.notes[0]?.key).toBe('floral')
    expect(both.notes[0]?.key).toBe('funk')
    expect(both.notes[0]!.share).toBeGreaterThan(both.notes[1]!.share)
  })

  it('reproduces the San Francisco Mission profile from real tag counts', () => {
    // Counts taken from a live 1-mile Overpass probe: 296 restaurants,
    // 106 cafes, 66 bars, 27 bakeries, 28 parks, 8 florists.
    const features = [
      ...Array.from({ length: 296 }, () =>
        feature({ amenity: 'restaurant', cuisine: 'mexican' }, 300),
      ),
      ...Array.from({ length: 106 }, () =>
        feature({ amenity: 'cafe', cuisine: 'coffee_shop' }, 300),
      ),
      ...Array.from({ length: 66 }, () => feature({ amenity: 'bar' }, 300)),
      ...Array.from({ length: 27 }, () => feature({ shop: 'bakery' }, 300)),
      ...Array.from({ length: 28 }, () => feature({ leisure: 'park' }, 300)),
      ...Array.from({ length: 8 }, () => feature({ shop: 'florist' }, 300)),
    ]

    const profile = computeScentProfile(features)

    expect(profile.notes[0]?.key).toBe('food')
    expect(profile.notes.map((n) => n.key)).toContain('coffee')
    // Cuisine tags should surface as concrete detail, not a generic count.
    expect(profile.notes[0]?.detail).toMatch(/Mexican/)
    expect(profile.summary).toMatch(/cooking/i)
  })

  it('splits semicolon-delimited cuisine tags', () => {
    const profile = computeScentProfile([
      feature({ amenity: 'restaurant', cuisine: 'pizza;italian' }, 100),
      feature({ amenity: 'restaurant', cuisine: 'pizza' }, 100),
    ])
    // Pizza appears twice, italian once, so pizza must lead the detail string.
    expect(profile.notes[0]?.detail).toMatch(/^2 pizza/)
  })

  it('lets one feature carry more than one note', () => {
    // A pub that also serves food smells of both.
    const profile = computeScentProfile([feature({ amenity: 'pub', cuisine: 'burger' }, 100)])
    const keys = profile.notes.map((n) => n.key)
    expect(keys).toContain('hops')
  })

  it('shares always total to a sensible range and never exceed 100', () => {
    const profile = computeScentProfile([
      feature({ amenity: 'restaurant' }, 100),
      feature({ amenity: 'cafe' }, 200),
      feature({ leisure: 'park' }, 300),
      feature({ landuse: 'industrial' }, 400),
      feature({ shop: 'florist' }, 500),
    ])

    for (const note of profile.notes) {
      expect(note.share).toBeGreaterThanOrEqual(0)
      expect(note.share).toBeLessThanOrEqual(100)
    }
    // Top four notes only, so the sum can be under 100 but never over it.
    const total = profile.notes.reduce((sum, note) => sum + note.share, 0)
    expect(total).toBeLessThanOrEqual(100)
  })

  it('caps the profile at four notes', () => {
    const profile = computeScentProfile([
      feature({ amenity: 'restaurant' }, 100),
      feature({ amenity: 'cafe' }, 100),
      feature({ amenity: 'bar' }, 100),
      feature({ leisure: 'park' }, 100),
      feature({ shop: 'florist' }, 100),
      feature({ landuse: 'industrial' }, 100),
      feature({ shop: 'bakery' }, 100),
    ])
    expect(profile.notes.length).toBeLessThanOrEqual(4)
  })

  it('ranks a closer source above an identical one further away', () => {
    const profile = computeScentProfile([
      feature({ landuse: 'landfill' }, 750),
      feature({ shop: 'bakery' }, 50),
      feature({ shop: 'bakery' }, 50),
      feature({ shop: 'bakery' }, 50),
    ])
    // Three bakeries on the doorstep beat one distant landfill at the edge.
    expect(profile.notes[0]?.key).toBe('bakery')
  })
})
