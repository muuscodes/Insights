import { describe, expect, it } from 'vitest'

import { NOISE_FEATURES } from '@/test/fixtures'
import { SCENT_TAG_KEYS, computeScentProfile } from './scent'
import type { TaggedFeature } from '@/lib/types'
import {
  CATEGORIES,
  CLASSIFIED_TAGS,
  CLASSIFY_TAG_KEYS,
  NEAR_QUERY_FILTERS,
  OVERPASS_MIRRORS,
  WIDE_FILTERS,
  classify,
} from './taxonomy'

describe('classify', () => {
  it('ignores street furniture, which dominates raw Overpass output', () => {
    // The live 1-mile probe around the White House returned 3,106 features, of
    // which 977 were benches. None of this may score.
    for (const tags of NOISE_FEATURES) {
      expect(classify(tags), JSON.stringify(tags)).toBeNull()
    }
  })

  it('ignores empty and disused storefronts', () => {
    expect(classify({ shop: 'vacant' })).toBeNull()
    expect(classify({ shop: 'no' })).toBeNull()
    expect(classify({ 'disused:shop': 'supermarket' })).toBeNull()
    expect(classify({ shop: 'supermarket', disused: 'yes' })).toBeNull()
  })

  it('handles missing and empty tags', () => {
    expect(classify(undefined)).toBeNull()
    expect(classify({})).toBeNull()
    expect(classify({ name: 'Unlabelled thing' })).toBeNull()
  })

  it.each([
    [{ shop: 'supermarket' }, 'grocery'],
    [{ shop: 'bakery' }, 'grocery'],
    [{ amenity: 'restaurant' }, 'restaurant'],
    [{ amenity: 'fast_food' }, 'restaurant'],
    [{ amenity: 'cafe' }, 'cafe'],
    [{ amenity: 'school' }, 'school'],
    [{ leisure: 'park' }, 'park'],
    [{ highway: 'bus_stop' }, 'transit'],
    [{ railway: 'subway_entrance' }, 'transit'],
    [{ amenity: 'bar' }, 'entertainment'],
    [{ tourism: 'museum' }, 'entertainment'],
    [{ amenity: 'bank' }, 'services'],
    [{ shop: 'clothes' }, 'retail'],
  ])('maps %j to %s', (tags, expected) => {
    expect(classify(tags)).toBe(expected)
  })

  it('prefers the more specific rule when a feature could land in two buckets', () => {
    // A pharmacy is healthcare, not retail.
    expect(classify({ amenity: 'pharmacy' })).toBe('healthcare')
    // A bakery is groceries, not a cafe and not generic retail.
    expect(classify({ shop: 'bakery' })).toBe('grocery')
    // A coffee shop is a cafe, not generic retail, despite matching shop=*.
    expect(classify({ shop: 'coffee' })).toBe('cafe')
  })
})

describe('filter tables', () => {
  it('fetches every tag the classifier can act on', () => {
    // The near query is intentionally broader than the rules, but it must never
    // be narrower: a tag the classifier understands and the query never asks
    // for is a category that silently always scores zero.
    const queried = new Set(NEAR_QUERY_FILTERS.map((filter) => filter.tag))
    for (const tag of CLASSIFIED_TAGS) {
      expect(queried.has(tag), `tag never queried: ${tag}`).toBe(true)
    }
  })

  it('keeps the near query small, since Overpass cost tracks clause count', () => {
    // Twelve value-filtered clauses timed out on two public instances; eight
    // returned 3,473 features in 7.1 seconds.
    expect(NEAR_QUERY_FILTERS.length).toBeLessThanOrEqual(8)
  })

  it('value-filters the tags that would otherwise pull in the whole map', () => {
    for (const tag of ['highway', 'landuse', 'natural']) {
      const filter = NEAR_QUERY_FILTERS.find((f) => f.tag === tag)
      expect(filter, `missing ${tag}`).toBeDefined()
      expect(filter!.values, `${tag} must not be a wildcard`).not.toBe('*')
    }
  })

  it('covers every category in the wide query set', () => {
    for (const category of CATEGORIES) {
      expect(WIDE_FILTERS[category.key].length, `wide: ${category.key}`).toBeGreaterThan(0)
    }
  })

  it('excludes the region-limited Swiss mirror', () => {
    // overpass.osm.ch only carries Switzerland and answers a US query with
    // 200 OK and zero elements, which a status-code-only failover would treat
    // as a successful empty neighbourhood.
    expect(OVERPASS_MIRRORS.some((url) => url.includes('osm.ch'))).toBe(false)
    expect(OVERPASS_MIRRORS.length).toBeGreaterThan(1)
  })

  it('keeps the wide query free of wildcards', () => {
    // A measured 5-mile query using shop=* around Times Square returned 31,785
    // elements and 10.9 MB. The wide pass must stay enumerated.
    for (const filters of Object.values(WIDE_FILTERS)) {
      for (const filter of filters) {
        expect(filter.values).not.toBe('*')
      }
    }
  })

  it('only uses tag values that are safe to interpolate into Overpass QL', () => {
    const safe = /^[a-z0-9_:]+$/
    const all = [...NEAR_QUERY_FILTERS, ...Object.values(WIDE_FILTERS).flat()]

    for (const filter of all) {
      expect(filter.tag, filter.tag).toMatch(safe)
      if (filter.values === '*') continue
      for (const value of filter.values) {
        expect(value, value).toMatch(safe)
      }
    }
  })

  it('gives every category a distinct colour so the map legend is readable', () => {
    const colors = new Set(CATEGORIES.map((c) => c.color))
    expect(colors.size).toBe(CATEGORIES.length)
  })

  /*
    The Overpass layer strips every tag key outside CLASSIFY_TAG_KEYS and
    SCENT_TAG_KEYS before a feature is retained, which is what keeps the cached
    payload small. If a rule or a scent matcher starts reading a key that is not
    declared, it is stripped before it ever arrives and the feature silently
    stops matching. These two guard that.
  */
  describe('retains every tag classify and scent read', () => {
    it('declares every tag the classification rules match on', () => {
      for (const tag of CLASSIFIED_TAGS) {
        expect(CLASSIFY_TAG_KEYS, tag).toContain(tag)
      }
    })

    it('survives a trim to the declared keys', () => {
      const retained = new Set([...CLASSIFY_TAG_KEYS, ...SCENT_TAG_KEYS])
      const trim = (tags: Record<string, string>): Record<string, string> =>
        Object.fromEntries(Object.entries(tags).filter(([key]) => retained.has(key)))

      // Realistic noise: the keys OSM features actually carry alongside the
      // handful we care about.
      const noise = {
        name: 'Somewhere',
        'name:es': 'Algun sitio',
        opening_hours: 'Mo-Su 08:00-22:00',
        wheelchair: 'yes',
        'addr:housenumber': '123',
        phone: '+1-555-0100',
      }

      const samples: Record<string, string>[] = [
        { amenity: 'restaurant', cuisine: 'mexican' },
        { amenity: 'cafe' },
        { shop: 'supermarket' },
        { shop: 'vacant' },
        { amenity: 'pharmacy' },
        { leisure: 'park' },
        { landuse: 'landfill' },
        { natural: 'water' },
        { man_made: 'wastewater_plant' },
        { craft: 'brewery' },
        { railway: 'station' },
        { highway: 'bus_stop' },
        { tourism: 'museum' },
        { amenity: 'restaurant', disused: 'yes' },
        { 'disused:shop': 'bakery' },
      ]

      for (const tags of samples) {
        const full = { ...tags, ...noise }
        expect(classify(trim(full)), JSON.stringify(tags)).toBe(classify(full))
      }

      const asFeatures = (build: (t: Record<string, string>) => Record<string, string>) =>
        samples.map(
          (tags, index): TaggedFeature => ({
            id: `node/${index}`,
            name: null,
            lat: 37.76,
            lng: -122.41,
            distanceM: 100,
            tags: build({ ...tags, ...noise }),
          }),
        )

      expect(computeScentProfile(asFeatures(trim))).toEqual(
        computeScentProfile(asFeatures((t) => t)),
      )
    })
  })
})
