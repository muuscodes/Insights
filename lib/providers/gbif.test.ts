import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchBirds } from './gbif'

afterEach(() => {
  vi.restoreAllMocks()
})

const CENTER = { lat: 37.774929, lng: -122.419416 }

interface Routes {
  facets?: Array<{ name: string; count: number }>
  species?: Record<number, unknown>
  vernacular?: Record<number, Array<{ vernacularName: string; language: string }>>
  fail?: (url: string) => boolean
}

/** Route the three GBIF endpoints this provider touches. */
function mockGbif({ facets = [], species = {}, vernacular = {}, fail }: Routes) {
  const spy = vi.fn(async (input: string | URL) => {
    const url = String(input)
    if (fail?.(url)) return new Response('down', { status: 503 })

    if (url.includes('/occurrence/search')) {
      return new Response(JSON.stringify({ facets: [{ field: 'SPECIES_KEY', counts: facets }] }), {
        status: 200,
      })
    }

    const vernacularMatch = url.match(/\/species\/(\d+)\/vernacularNames/)
    if (vernacularMatch) {
      const key = Number(vernacularMatch[1])
      return new Response(JSON.stringify({ results: vernacular[key] ?? [] }), { status: 200 })
    }

    const speciesMatch = url.match(/\/species\/(\d+)/)
    if (speciesMatch) {
      const key = Number(speciesMatch[1])
      return new Response(JSON.stringify(species[key] ?? {}), { status: 200 })
    }

    return new Response('{}', { status: 200 })
  })

  vi.stubGlobal('fetch', spy as unknown as typeof fetch)
  return spy
}

describe('fetchBirds', () => {
  it('resolves facet species keys into named birds', async () => {
    mockGbif({
      facets: [{ name: '5231190', count: 412 }],
      species: { 5231190: { canonicalName: 'Passer domesticus', vernacularName: 'house sparrow' } },
    })

    const birds = await fetchBirds(CENTER)

    expect(birds).toEqual([
      {
        speciesKey: 5231190,
        commonName: 'House Sparrow',
        scientificName: 'Passer domesticus',
        observations: 412,
      },
    ])
  })

  it('asks the requested area and window of the occurrence search', async () => {
    const spy = mockGbif({ facets: [] })
    await fetchBirds(CENTER)

    const url = String(spy.mock.calls[0]?.[0])
    // geoDistance must be one "lat,lng,distance" value; split parts are a 400.
    expect(url).toContain(`geoDistance=${CENTER.lat},${CENTER.lng},1.61km`)
    // limit=0 keeps the response to facets rather than occurrence rows.
    expect(url).toContain('limit=0')
  })

  it('falls back to the vernacular endpoint, taking the most submitted name', async () => {
    // The list carries regional aliases, so taking the first English entry
    // yields "Hollywood Finch" for the House Finch.
    mockGbif({
      facets: [{ name: '9100816', count: 88 }],
      species: { 9100816: { canonicalName: 'Haemorhous mexicanus' } },
      vernacular: {
        9100816: [
          { vernacularName: 'Hollywood Finch', language: 'eng' },
          { vernacularName: 'House Finch', language: 'eng' },
          { vernacularName: 'House Finch', language: 'eng' },
          { vernacularName: 'Pinzon Mexicano', language: 'spa' },
        ],
      },
    })

    const birds = await fetchBirds(CENTER)
    expect(birds[0]?.commonName).toBe('House Finch')
  })

  it('lets frequency outrank length, which is what makes the rule work', async () => {
    // Frequency is the real signal. Length only breaks exact ties, and it is
    // the weaker of the two: here the alias is the shorter string, so length
    // alone would pick it.
    mockGbif({
      facets: [{ name: '2489101', count: 40 }],
      species: { 2489101: { canonicalName: 'Agelaius phoeniceus' } },
      vernacular: {
        2489101: [
          { vernacularName: 'Bicolored Blackbird', language: 'eng' },
          { vernacularName: 'Red-winged Blackbird', language: 'eng' },
          { vernacularName: 'Red-winged Blackbird', language: 'eng' },
        ],
      },
    })

    const birds = await fetchBirds(CENTER)
    expect(birds[0]?.commonName).toBe('Red-winged Blackbird')
  })

  it('falls back to the shorter name on an exact tie', async () => {
    // Documented limit rather than a guarantee: on a true tie the shorter
    // string wins, and that is not always the plainer one. Real GBIF lists
    // carry enough entries that exact ties are rare.
    mockGbif({
      facets: [{ name: '2489101', count: 40 }],
      species: { 2489101: { canonicalName: 'Agelaius phoeniceus' } },
      vernacular: {
        2489101: [
          { vernacularName: 'Bicolored Blackbird', language: 'eng' },
          { vernacularName: 'Red-winged Blackbird', language: 'eng' },
        ],
      },
    })

    const birds = await fetchBirds(CENTER)
    expect(birds[0]?.commonName).toBe('Bicolored Blackbird')
  })

  it('ignores non-English vernacular names entirely', async () => {
    mockGbif({
      facets: [{ name: '777', count: 12 }],
      species: { 777: { canonicalName: 'Corvus corax' } },
      vernacular: {
        777: [
          { vernacularName: 'Cuervo', language: 'spa' },
          { vernacularName: 'Cuervo', language: 'spa' },
          { vernacularName: 'Common Raven', language: 'eng' },
        ],
      },
    })

    const birds = await fetchBirds(CENTER)
    expect(birds[0]?.commonName).toBe('Common Raven')
  })

  it('falls back to the scientific name when no common name exists', async () => {
    mockGbif({
      facets: [{ name: '1234', count: 5 }],
      species: { 1234: { canonicalName: 'Obscurus avis' } },
    })

    const birds = await fetchBirds(CENTER)
    expect(birds[0]?.commonName).toBe('Obscurus avis')
  })

  it('returns an empty list when the area has no observations', async () => {
    mockGbif({ facets: [] })
    await expect(fetchBirds(CENTER)).resolves.toEqual([])
  })

  it('ignores facet rows with an unusable key or a zero count', async () => {
    mockGbif({
      facets: [
        { name: 'not-a-number', count: 10 },
        { name: '55', count: 0 },
      ],
    })

    await expect(fetchBirds(CENTER)).resolves.toEqual([])
  })

  it('drops one species whose lookup fails rather than the whole panel', async () => {
    mockGbif({
      facets: [
        { name: '111', count: 30 },
        { name: '222', count: 20 },
      ],
      species: { 111: { canonicalName: 'Good bird', vernacularName: 'Good Bird' } },
      fail: (url) => url.includes('/species/222'),
    })

    const birds = await fetchBirds(CENTER)
    expect(birds.map((b) => b.speciesKey)).toEqual([111])
  })

  it('propagates a failure of the occurrence search itself', async () => {
    mockGbif({ fail: (url) => url.includes('/occurrence/search') })
    await expect(fetchBirds(CENTER)).rejects.toMatchObject({ name: 'UpstreamError' })
  })
})
