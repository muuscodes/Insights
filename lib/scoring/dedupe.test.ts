import { describe, expect, it } from 'vitest'

import type { Poi } from '../types'
import { dedupePois } from './dedupe'
import type { CategoryKey } from './taxonomy'

/** Roughly metres to degrees of latitude, for placing fixtures a known distance apart. */
const M = 1 / 111_320

let seq = 0
function at(category: CategoryKey, name: string | null, offsetM: number, distanceM = offsetM): Poi {
  seq += 1
  return {
    id: `way/${seq}`,
    name,
    lat: 38.8976 + offsetM * M,
    lng: -77.0365,
    distanceM,
    category,
    tags: {},
  }
}

describe('dedupePois', () => {
  it('collapses many polygons sharing a name into one', () => {
    // The real shape of the bug: one park drawn as a dozen adjacent ways.
    const fragments = Array.from({ length: 12 }, (_, i) =>
      at('park', "President's Park", i * 15, 200 + i),
    )

    const kept = dedupePois(fragments)
    expect(kept).toHaveLength(1)
  })

  it('keeps the closest of a merged group', () => {
    const kept = dedupePois([
      at('park', 'Lincoln Park', 0, 900),
      at('park', 'Lincoln Park', 20, 120),
    ])

    expect(kept).toHaveLength(1)
    expect(kept[0]?.distanceM).toBe(120)
  })

  it('keeps two branches of the same chain that are genuinely apart', () => {
    // Same name, but 400 m apart, which is past the same-name threshold.
    const kept = dedupePois([at('cafe', 'Starbucks', 0, 50), at('cafe', 'Starbucks', 400, 400)])
    expect(kept).toHaveLength(2)
  })

  it('collapses unnamed fragments into a named area of the same category', () => {
    const kept = dedupePois([
      at('park', 'Meridian Hill Park', 0, 100),
      at('park', null, 30, 130),
      at('park', null, 50, 150),
    ])
    expect(kept).toHaveLength(1)
    expect(kept[0]?.name).toBe('Meridian Hill Park')
  })

  it('collapses adjacent unnamed area fragments', () => {
    const kept = dedupePois([at('park', null, 0, 100), at('park', null, 40, 140)])
    expect(kept).toHaveLength(1)
  })

  it('folds a named sub-feature into the named park it sits inside', () => {
    // The reported bug. OSM maps the White House grounds as a park plus a
    // putting green, a playground and a basketball court, all within ~100 m.
    // Those are facilities of one park, not four parks.
    const kept = dedupePois([
      at('park', "The White House and President's Park", 0, 178),
      at('park', 'White House Putting Green', 80, 79),
      at('park', 'White House Playground', 95, 98),
    ])

    expect(kept).toHaveLength(1)
  })

  it('keeps genuinely separate urban squares apart', () => {
    // Downtown DC really does have dozens of distinct squares, and they sit
    // 200 m or more apart. Merging those would be just as wrong.
    const kept = dedupePois([
      at('park', "President's Park", 0, 178),
      at('park', 'Lafayette Square', 260, 209),
      at('park', 'Farragut Square', 700, 522),
    ])

    expect(kept).toHaveLength(3)
  })

  it('never merges unnamed point-like places, which really are distinct', () => {
    // Two unnamed restaurants twenty metres apart are two restaurants.
    const kept = dedupePois([at('restaurant', null, 0, 100), at('restaurant', null, 20, 120)])
    expect(kept).toHaveLength(2)
  })

  it('never merges across categories', () => {
    const kept = dedupePois([at('park', 'Riverside', 0, 100), at('school', 'Riverside', 10, 110)])
    expect(kept).toHaveLength(2)
  })

  it('keeps unnamed area fragments that are far apart', () => {
    const kept = dedupePois([at('park', null, 0, 100), at('park', null, 500, 600)])
    expect(kept).toHaveLength(2)
  })

  it('is stable and idempotent', () => {
    const input = [
      at('park', 'A', 0, 100),
      at('park', 'A', 20, 120),
      at('restaurant', null, 0, 90),
      at('restaurant', null, 25, 115),
    ]

    const once = dedupePois(input)
    const twice = dedupePois(once)
    expect(twice.map((p) => p.id)).toEqual(once.map((p) => p.id))
  })

  it('handles an empty list', () => {
    expect(dedupePois([])).toEqual([])
  })

  it('treats names differing only by case and spacing as the same', () => {
    const kept = dedupePois([
      at('park', 'Logan  Circle', 0, 100),
      at('park', 'logan circle', 20, 120),
    ])
    expect(kept).toHaveLength(1)
  })
})
