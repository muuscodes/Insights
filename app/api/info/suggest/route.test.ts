import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetRateLimitForTests } from '@/lib/ratelimit'

const suggestAddresses = vi.fn()

vi.mock('@/lib/providers/photon', () => ({
  suggestAddresses: (query: string) => suggestAddresses(query),
}))

const { GET } = await import('./route')

const request = (query: string, ip = '203.0.113.1') =>
  new Request(`https://example.test/api/info/suggest?q=${encodeURIComponent(query)}`, {
    headers: { 'x-forwarded-for': ip },
  })

beforeEach(() => {
  __resetRateLimitForTests()
  suggestAddresses.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/info/suggest', () => {
  it('returns suggestions for a valid query', async () => {
    suggestAddresses.mockResolvedValue({
      suggestions: [
        {
          id: 'n1',
          primary: '1600 Pennsylvania Ave NW',
          secondary: 'Washington, DC 20500',
          lat: 38.8977,
          lng: -77.0365,
        },
      ],
      sawNonUsMatches: false,
    })

    const response = await GET(request('1600 Pennsylvania'))
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.suggestions).toHaveLength(1)
    expect(body.suggestions[0].primary).toBe('1600 Pennsylvania Ave NW')
    expect(body.sawNonUsMatches).toBe(false)
  })

  it('reports when a query only matched addresses outside the US', async () => {
    // Drives the "not available yet" note, so the user learns the address was
    // recognised and simply is not supported, rather than assuming a typo.
    suggestAddresses.mockResolvedValue({ suggestions: [], sawNonUsMatches: true })

    const body = await (await GET(request('10 Downing Street'))).json()
    expect(body.suggestions).toEqual([])
    expect(body.sawNonUsMatches).toBe(true)
  })

  it('returns an empty list for a too-short query without calling upstream', async () => {
    const response = await GET(request('16'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ suggestions: [], sawNonUsMatches: false })
    expect(suggestAddresses).not.toHaveBeenCalled()
  })

  it('does not forward an oversized query upstream', async () => {
    const response = await GET(request('a'.repeat(500)))

    expect(response.status).toBe(200)
    expect(suggestAddresses).not.toHaveBeenCalled()
  })

  it('degrades to an empty list when the provider fails', async () => {
    // A dead autocomplete must not break the form.
    suggestAddresses.mockRejectedValue(new Error('photon down'))

    const response = await GET(request('1600 Pennsylvania'))
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.suggestions).toEqual([])
    expect(body.degraded).toBe(true)
  })

  it('rate limits a client that floods it', async () => {
    suggestAddresses.mockResolvedValue({ suggestions: [], sawNonUsMatches: false })

    let lastStatus = 200
    for (let i = 0; i < 45; i++) {
      lastStatus = (await GET(request('1600 Pennsylvania', '198.51.100.9'))).status
    }

    expect(lastStatus).toBe(429)
  })

  it('sets Retry-After when it rate limits', async () => {
    suggestAddresses.mockResolvedValue({ suggestions: [], sawNonUsMatches: false })

    let response = new Response()
    for (let i = 0; i < 45; i++) {
      response = await GET(request('1600 Pennsylvania', '198.51.100.10'))
    }

    expect(response.status).toBe(429)
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0)
  })

  it('does not let one client limit affect another', async () => {
    suggestAddresses.mockResolvedValue({ suggestions: [], sawNonUsMatches: false })

    for (let i = 0; i < 45; i++) {
      await GET(request('1600 Pennsylvania', '198.51.100.11'))
    }

    const other = await GET(request('1600 Pennsylvania', '198.51.100.12'))
    expect(other.status).toBe(200)
  })
})
