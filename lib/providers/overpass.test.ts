import { afterEach, describe, expect, it, vi } from 'vitest'

import { OVERPASS_MIRRORS } from '../scoring/taxonomy'
import { fetchDrivePois, fetchNearPois } from './overpass'

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

/**
 * The wide pass is started speculatively alongside the near pass, so call order
 * is not stable. Queries are identified by their radius instead.
 */
type QueryKind = 'near' | 'wide'

const kindOf = (query: string): QueryKind =>
  query.includes('around:1609.344000') ? 'near' : 'wide'

interface Call {
  url: string
  query: string
  kind: QueryKind
}

function mockOverpass(handler: (call: Call, attempt: number) => Response) {
  const calls: Call[] = []
  const spy = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const body = String(init?.body ?? '')
    const query = decodeURIComponent(body.replace(/^data=/, '').replace(/\+/g, ' '))
    const call: Call = { url: String(url), query, kind: kindOf(query) }
    calls.push(call)
    return handler(call, calls.filter((c) => c.kind === call.kind).length)
  })
  vi.stubGlobal('fetch', spy as unknown as typeof fetch)
  return { spy, calls }
}

const ok = (elements: StubElement[]) => new Response(JSON.stringify({ elements }), { status: 200 })

/** The two passes as the report runs them: near first, then wide off its result. */
async function fetchPois(center: typeof CENTER) {
  const near = await fetchNearPois(center)
  const wide = await fetchDrivePois(center, near.nearPois)
  return { ...near, ...wide }
}

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
    expect(result.nearPois.map((p: { category: string }) => p.category)).toEqual(['grocery'])
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
    const { calls } = mockOverpass((call, attempt) =>
      attempt === 1
        ? new Response('busy', { status: 429 })
        : ok([node(1, { shop: 'supermarket' }, 50)]),
    )

    const result = await fetchPois(CENTER)
    const nearCalls = calls.filter((c) => c.kind === 'near')

    expect(result.nearPois).toHaveLength(1)
    // A failure launches the next mirror immediately rather than waiting out
    // the hedge stagger, and the leader is still tried first.
    expect(nearCalls[0]?.url).toBe(OVERPASS_MIRRORS[0])
    expect(nearCalls[1]?.url).toBe(OVERPASS_MIRRORS[1])
  })

  it('treats an empty 200 as a failure worth retrying elsewhere', async () => {
    // The Swiss mirror answers a US query with 200 OK and zero elements. A
    // failover that trusts the status code reported a walking score of zero for
    // the Mission, which is what this guards.
    const { calls } = mockOverpass((call, attempt) =>
      attempt === 1 ? ok([]) : ok([node(1, { shop: 'supermarket' }, 50)]),
    )

    const result = await fetchPois(CENTER)

    expect(result.nearPois).toHaveLength(1)
    expect(calls.filter((c) => c.kind === 'near').length).toBeGreaterThan(1)
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
    const { calls } = mockOverpass(() => ok([node(1, { shop: 'supermarket' }, 50)]))

    await fetchPois(CENTER)
    const near = calls.find((c) => c.kind === 'near')?.query ?? ''

    // Coordinates land as plain decimals, never as anything executable.
    expect(near).toContain('around:1609.344000,37.774929,-122.419416')
    // Tag names and values come from the hardcoded taxonomy only.
    for (const { query } of calls) {
      for (const token of query.matchAll(/\["([^"~]+)"/g)) {
        expect(token[1], token[1]).toMatch(/^[a-z0-9_:]+$/)
      }
    }
  })

  it('collapses filters that share a tag into one spatial clause', async () => {
    // Overpass cost tracks clause count, so this is the difference between a
    // query that returns and one that times out.
    const { calls } = mockOverpass(() => ok([node(1, { shop: 'supermarket' }, 50)]))

    await fetchPois(CENTER)

    for (const { query } of calls) {
      const tags = [...query.matchAll(/\["([a-z_:]+)"/g)].map((m) => m[1])
      expect(new Set(tags).size, `each tag should appear once in:\n${query}`).toBe(tags.length)
    }
  })

  it('widens only for categories the first pass left short', async () => {
    mockOverpass((call) =>
      // Saturate groceries near, leave everything else empty.
      call.kind === 'near'
        ? ok([
            node(1, { shop: 'supermarket', name: 'A' }, 50),
            node(2, { shop: 'supermarket', name: 'B' }, 400),
            node(3, { shop: 'supermarket', name: 'C' }, 700),
          ])
        : ok([]),
    )

    const result = await fetchPois(CENTER)

    expect(result.widenedCategories).not.toContain('grocery')
    expect(result.widenedCategories).toContain('cafe')
  })

  it('asks the wide pass only for the categories that were short', async () => {
    const { calls } = mockOverpass((call) =>
      call.kind === 'near'
        ? ok([
            node(1, { shop: 'supermarket', name: 'A' }, 50),
            node(2, { shop: 'supermarket', name: 'B' }, 400),
            node(3, { shop: 'supermarket', name: 'C' }, 700),
          ])
        : ok([node(10, { amenity: 'cafe', name: 'Far Cafe' }, 6000)]),
    )

    await fetchPois(CENTER)
    const wide = calls.find((c) => c.kind === 'wide')?.query ?? ''

    // Groceries saturated inside a mile, so the wide query must not spend a
    // clause on them.
    expect(wide).not.toContain('supermarket')
    expect(wide).toContain('cafe')
  })

  it('keeps the driving score when the wide pass fails', async () => {
    // The wide pass is an enhancement. A failure there must not take out the
    // whole report.
    mockOverpass((call) =>
      call.kind === 'near'
        ? ok([node(1, { shop: 'supermarket', name: 'Market' }, 50)])
        : new Response('down', { status: 503 }),
    )

    const result = await fetchPois(CENTER)

    expect(result.nearPois).toHaveLength(1)
    expect(result.drivePois).toEqual(result.nearPois)
  })

  it('never runs both passes against one host at the same time', async () => {
    /*
      The primary mirror reports `Rate limit: 2` on /api/status, meaning two
      concurrent queries per IP. Running both stages at once spends the whole
      allowance on a single report and leaves the hedge nothing to spend, so
      everything queues. Measured when it was tried: every address went to
      19-25s and the score panels began failing outright.
    */
    let concurrentOnLeadHost = 0
    let peak = 0

    const spy = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const isLead = String(url) === OVERPASS_MIRRORS[0]
      if (isLead) {
        concurrentOnLeadHost += 1
        peak = Math.max(peak, concurrentOnLeadHost)
      }
      await Promise.resolve()
      if (isLead) concurrentOnLeadHost -= 1

      const body = String(init?.body ?? '')
      const query = decodeURIComponent(body.replace(/^data=/, '').replace(/\+/g, ' '))
      return ok([
        kindOf(query) === 'near'
          ? node(1, { shop: 'supermarket' }, 50)
          : node(2, { amenity: 'cafe' }, 6000),
      ])
    })
    vi.stubGlobal('fetch', spy as unknown as typeof fetch)

    await fetchPois(CENTER)

    expect(peak).toBe(1)
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

  it('gives up on a pass once its budget is spent instead of walking on', async () => {
    // Per-request timeouts do not bound a pass on their own: three mirrors at
    // 15s each is 45s. A cold rural address measured 67.4s, past the function
    // ceiling, before the budget existed.
    let clock = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => clock)

    const { calls } = mockOverpass(() => {
      // Every mirror burns 25s and then fails, so the 45s budget is gone before
      // the third one would have been reached.
      clock += 25_000
      return new Response('slow', { status: 504 })
    })

    await expect(fetchNearPois(CENTER)).rejects.toMatchObject({ name: 'UpstreamError' })

    // Three mirrors are available; the budget must stop it before all three.
    expect(calls.length).toBeLessThan(OVERPASS_MIRRORS.length)
  })

  it('still uses the wide pass when there is budget left', async () => {
    let clock = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => clock)

    mockOverpass((call) => {
      clock += 1_000
      return call.kind === 'near'
        ? ok([node(1, { shop: 'supermarket' }, 50)])
        : ok([node(2, { amenity: 'cafe' }, 6000)])
    })

    const result = await fetchPois(CENTER)

    expect(result.drivePois.map((p: { id: string }) => p.id)).toContain('node/2')
  })

  it('deduplicates a place returned by more than one clause', async () => {
    mockOverpass(() =>
      ok([node(1, { shop: 'supermarket' }, 50), node(1, { shop: 'supermarket' }, 50)]),
    )

    expect((await fetchPois(CENTER)).nearFeatures).toHaveLength(1)
  })
})
