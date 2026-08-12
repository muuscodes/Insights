import { afterEach, describe, expect, it, vi } from 'vitest'

import { reverseLabel, suggestAddresses } from './photon'

afterEach(() => {
  vi.restoreAllMocks()
})

interface StubProps {
  osm_id?: number
  osm_type?: string
  name?: string
  housenumber?: string
  street?: string
  city?: string
  district?: string
  county?: string
  state?: string
  postcode?: string
  countrycode?: string
}

function feature(properties: StubProps, lng = -122.4, lat = 37.77) {
  return { geometry: { coordinates: [lng, lat] }, properties }
}

function mockPhoton(features: ReturnType<typeof feature>[]) {
  const spy = vi.fn(async () => new Response(JSON.stringify({ features }), { status: 200 }))
  vi.stubGlobal('fetch', spy as unknown as typeof fetch)
  return spy
}

describe('suggestAddresses', () => {
  it('builds a street line and a locality line', async () => {
    mockPhoton([
      feature({
        osm_id: 1,
        housenumber: '1600',
        street: 'Pennsylvania Avenue Northwest',
        city: 'Washington',
        state: 'District of Columbia',
        postcode: '20500',
        countrycode: 'US',
      }),
    ])

    const { suggestions } = await suggestAddresses('1600 penn')

    expect(suggestions[0]?.primary).toBe('1600 Pennsylvania Avenue Northwest')
    expect(suggestions[0]?.secondary).toBe('Washington, District of Columbia 20500')
  })

  it('falls back to the place name when there is no street', async () => {
    mockPhoton([
      feature({ osm_id: 2, name: 'Golden Gate Park', city: 'San Francisco', countrycode: 'US' }),
    ])

    const { suggestions } = await suggestAddresses('golden gate')
    expect(suggestions[0]?.primary).toBe('Golden Gate Park')
  })

  it('drops non-US matches but reports that it saw them', async () => {
    // Every insight downstream is US-only, so offering a Paris address that
    // then fails to produce half the page would be worse than saying so.
    mockPhoton([
      feature({ osm_id: 3, street: 'Rue de Rivoli', city: 'Paris', countrycode: 'FR' }),
      feature({ osm_id: 4, name: 'Somewhere', city: 'Berlin', countrycode: 'DE' }),
    ])

    const result = await suggestAddresses('rue de')

    expect(result.suggestions).toEqual([])
    expect(result.sawNonUsMatches).toBe(true)
  })

  it('does not count an unlabelled stray node as a non-US match', async () => {
    mockPhoton([feature({ osm_id: 5, countrycode: 'FR' })])

    const result = await suggestAddresses('nothing')
    expect(result.sawNonUsMatches).toBe(false)
  })

  it('collapses the same place returned as both a node and a way', async () => {
    const same: StubProps = {
      street: 'Market Street',
      housenumber: '1',
      city: 'San Francisco',
      state: 'California',
      countrycode: 'US',
    }
    mockPhoton([
      feature({ ...same, osm_id: 6, osm_type: 'N' }),
      feature({ ...same, osm_id: 7, osm_type: 'W' }),
    ])

    const { suggestions } = await suggestAddresses('1 market')
    expect(suggestions).toHaveLength(1)
  })

  it('caps the list at six', async () => {
    mockPhoton(
      Array.from({ length: 12 }, (_, i) =>
        feature({
          osm_id: 100 + i,
          street: `Street ${i}`,
          housenumber: '1',
          city: 'Springfield',
          countrycode: 'US',
        }),
      ),
    )

    const { suggestions } = await suggestAddresses('street')
    expect(suggestions).toHaveLength(6)
  })

  it('skips a feature with no usable coordinates', async () => {
    const broken = { geometry: {}, properties: { street: 'X', countrycode: 'US' } }
    const spy = vi.fn(
      async () => new Response(JSON.stringify({ features: [broken] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', spy as unknown as typeof fetch)

    const { suggestions } = await suggestAddresses('x')
    expect(suggestions).toEqual([])
  })
})

describe('reverseLabel', () => {
  it('joins the street and locality lines', async () => {
    mockPhoton([
      feature({
        housenumber: '1',
        street: 'Market Street',
        city: 'San Francisco',
        state: 'California',
        countrycode: 'US',
      }),
    ])

    await expect(reverseLabel({ lat: 37.77, lng: -122.4 })).resolves.toBe(
      '1 Market Street, San Francisco, California',
    )
  })

  it('returns null rather than throwing when the lookup fails', async () => {
    // A missing label is survivable: the page falls back to the coordinates.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('down', { status: 503 })) as unknown as typeof fetch,
    )

    await expect(reverseLabel({ lat: 37.77, lng: -122.4 })).resolves.toBeNull()
  })

  it('returns null when the response has no features', async () => {
    mockPhoton([])
    await expect(reverseLabel({ lat: 37.77, lng: -122.4 })).resolves.toBeNull()
  })
})
