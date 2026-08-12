import { afterEach, describe, expect, it, vi } from 'vitest'

import { OVERPASS_MIRRORS } from '../scoring/taxonomy'
import { fetchPois } from './overpass'

/*
  The Overpass layer carries the behaviours this project learned the hard way,
  and none of them were covered: the mirror walk, treating an empty 200 as a
  failure worth retrying, the injection guard on the query builder, and the
  wide pass being an enhancement that must never take the page down with it.
*/

const CENTER = { lat: 37.774929, lng: -122.419416 }

afterEach(() => {
  vi.restoreAllMocks()
})

interface StubElement {
  type: 'node'
  id: number
  lat: number
  lon: number
  tags: Record<string, string>
}

/** A node `metres` north of the centre, near enough for these distances. */
function node(id: number, tags: Record<string, string>, metres: number): StubElement {
  return {
    type: 'node',
    id,
    lat: CENTER.lat + metres / 111_320,
    lon: CENTER.lng,
    tags,
  }
}

/** Captures the query body sent to each mirror, in order. */
function mockOverpass(handler: (url: string, query: string, call: number) => Response) {
  let call = 0
  const spy = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const body = String(init?.body ?? '')
    const query = decodeURIComponent(body.replace(/^data=/, '').replace(/\+/g, ' '))
    call += 1
    return handler(String(url), query, call)
  })
  vi.stubGlobal('fetch', spy as unknown as typeof fetch)
  return spy
}

const ok = (elements: StubElement[]) => new Response(JSON.stringify({ elements }), { status: 200 })

describe('fetchPois', () => {
  it('classifies what comes back and keeps unscored features for the scent profile', async () => {
    mockOverpass(() =>
      ok([
        node(1, { shop: 'supermarket', name: 'Market' }, 100),
        node(2, { amenity: 'bench' }, 120),
        node(3, { landuse: 'landfill' }, 300),
      ]),
    )

    const result = await fetchPois(CENTER)

    // The bench and the landfill do not score.
    expect(result.nearPois.map((p) => p.category)).toEqual(['grocery'])
    // But all three survive for the scent profile, which reads raw tags.
    expect(result.nearFeatures).toHaveLength(3)
  })

  it('drops features outside the walking radius', async () => {
    mockOverpass(() =>
      ok([node(1, { shop: 'supermarket' }, 100), node(2, { shop: 'bakery' }, 5000)]),
    )

    const result = await fetchPois(CENTER)
    expect(result.nearPois).toHaveLength(1)
  })

  it('moves to the next mirror when one fails', async () => {
    const spy = mockOverpass((_url, _query, call) =>
      call === 1
        ? new Response('busy', { status: 429 })
        : ok([node(1, { shop: 'supermarket' }, 50)]),
    )

    const result = await fetchPois(CENTER)

    expect(result.nearPois).toHaveLength(1)
    expect(spy.mock.calls[0]?.[0]).toBe(OVERPASS_MIRRORS[0])
    expect(spy.mock.calls[1]?.[0]).toBe(OVERPASS_MIRRORS[1])
  })

  it('treats an empty 200 as a failure worth retrying elsewhere', async () => {
    // The Swiss mirror answers a US query with 200 OK and zero elements. A
    // failover that trusts the status code reported a walking score of zero for
    // the Mission, which is what this guards.
    const spy = mockOverpass((_url, _query, call) =>
      call === 1 ? ok([]) : ok([node(1, { shop: 'supermarket' }, 50)]),
    )

    const result = await fetchPois(CENTER)

    expect(result.nearPois).toHaveLength(1)
    expect(spy.mock.calls.length).toBeGreaterThan(1)
  })

  it('believes an empty answer once every mirror agrees', async () => {
    // Some addresses really do have nothing within a mile, and that is a
    // finding rather than an error.
    mockOverpass(() => ok([]))

    const result = await fetchPois(CENTER)
    expect(result.nearPois).toEqual([])
    expect(result.nearFeatures).toEqual([])
  })

  it('throws when every mirror genuinely errors', async () => {
    mockOverpass(() => new Response('down', { status: 503 }))
    await expect(fetchPois(CENTER)).rejects.toMatchObject({ name: 'UpstreamError' })
  })

  it('only interpolates numbers and whitelisted tokens into the query', async () => {
    const queries: string[] = []
    mockOverpass((_url, query) => {
      queries.push(query)
      return ok([node(1, { shop: 'supermarket' }, 50)])
    })

    await fetchPois(CENTER)
    const near = queries[0] ?? ''

    // Coordinates land as plain decimals, never as anything executable.
    expect(near).toContain('around:1609.344000,37.774929,-122.419416')
    // Tag names and values come from the hardcoded taxonomy only.
    for (const query of queries) {
      for (const token of query.matchAll(/\["([^"~]+)"/g)) {
        expect(token[1], token[1]).toMatch(/^[a-z0-9_:]+$/)
      }
    }
  })

  it('collapses filters that share a tag into one spatial clause', async () => {
    // Overpass cost tracks clause count, so this is the difference between a
    // query that returns and one that times out.
    const queries: string[] = []
    mockOverpass((_url, query) => {
      queries.push(query)
      return ok([node(1, { shop: 'supermarket' }, 50)])
    })

    await fetchPois(CENTER)

    for (const query of queries) {
      const tags = [...query.matchAll(/\["([a-z_:]+)"/g)].map((m) => m[1])
      expect(new Set(tags).size, `each tag should appear once in:\n${query}`).toBe(tags.length)
    }
  })

  it('widens only for categories the first pass left short', async () => {
    const queries: string[] = []
    mockOverpass((_url, query) => {
      queries.push(query)
      // Saturate groceries near, leave everything else empty.
      return queries.length === 1
        ? ok([
            node(1, { shop: 'supermarket', name: 'A' }, 50),
            node(2, { shop: 'supermarket', name: 'B' }, 400),
            node(3, { shop: 'supermarket', name: 'C' }, 700),
          ])
        : ok([])
    })

    const result = await fetchPois(CENTER)

    expect(result.widenedCategories).not.toContain('grocery')
    expect(result.widenedCategories).toContain('cafe')
  })

  it('keeps the driving score when the wide pass fails', async () => {
    // The wide pass is an enhancement. A failure there must not take out the
    // whole report.
    let call = 0
    mockOverpass(() => {
      call += 1
      return call === 1
        ? ok([node(1, { shop: 'supermarket', name: 'Market' }, 50)])
        : new Response('down', { status: 503 })
    })

    const result = await fetchPois(CENTER)

    expect(result.nearPois).toHaveLength(1)
    expect(result.drivePois).toEqual(result.nearPois)
  })

  it('strips tags nothing downstream reads', async () => {
    mockOverpass(() =>
      ok([
        node(
          1,
          {
            shop: 'supermarket',
            name: 'Market',
            opening_hours: 'Mo-Su 08:00-22:00',
            'addr:housenumber': '123',
            phone: '+1-555-0100',
          },
          50,
        ),
      ]),
    )

    const [feature] = (await fetchPois(CENTER)).nearFeatures

    expect(feature?.name).toBe('Market')
    expect(feature?.tags).toEqual({ shop: 'supermarket' })
  })

  it('skips the wide pass when the near pass has eaten the budget', async () => {
    // Per-request timeouts alone do not bound this: three mirrors at 25s each,
    // twice over, is 150s. A cold rural address measured 67.4s, past the 60s
    // function ceiling, because sparse areas widen for nearly every category.
    const queries: string[] = []
    let clock = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => clock)

    mockOverpass((_url, query) => {
      queries.push(query)
      // The near pass burns 44 of the 45 second budget.
      clock += 44_000
      return ok([node(1, { shop: 'supermarket' }, 50)])
    })

    const result = await fetchPois(CENTER)

    expect(queries).toHaveLength(1)
    expect(result.drivePois).toEqual(result.nearPois)
  })

  it('still runs the wide pass when there is budget left', async () => {
    const queries: string[] = []
    let clock = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => clock)

    mockOverpass((_url, query) => {
      queries.push(query)
      clock += 2_000
      return ok([node(queries.length, { shop: 'supermarket' }, 50)])
    })

    await fetchPois(CENTER)
    expect(queries).toHaveLength(2)
  })

  it('deduplicates a place returned by more than one clause', async () => {
    mockOverpass(() =>
      ok([node(1, { shop: 'supermarket' }, 50), node(1, { shop: 'supermarket' }, 50)]),
    )

    expect((await fetchPois(CENTER)).nearFeatures).toHaveLength(1)
  })
})
