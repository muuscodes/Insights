import { describe, expect, it } from 'vitest'

import { NOISE_FEATURES } from '@/test/fixtures'
import {
  CATEGORIES,
  CLASSIFIED_TAGS,
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
})
