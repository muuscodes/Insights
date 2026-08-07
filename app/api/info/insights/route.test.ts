import { beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetRateLimitForTests } from '@/lib/ratelimit'

const buildInsights = vi.fn()

vi.mock('@/lib/insights', () => ({
  buildInsights: (...args: unknown[]) => buildInsights(...args),
}))

const { GET } = await import('./route')

const request = (query: string, ip = '203.0.113.2') =>
  new Request(`https://example.test/api/info/insights?${query}`, {
    headers: { 'x-forwarded-for': ip },
  })

const payload = {
  address: { formatted: 'Somewhere', lat: 38.8977, lng: -77.0365, tractGeoid: null },
  walk: { ok: true, data: { score: 88 } },
}

beforeEach(() => {
  __resetRateLimitForTests()
  buildInsights.mockReset()
  buildInsights.mockResolvedValue(payload)
})

describe('GET /api/info/insights', () => {
  it('returns the payload for valid coordinates', async () => {
    const response = await GET(request('lat=38.8977&lng=-77.0365'))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ walk: { ok: true } })
    expect(buildInsights).toHaveBeenCalledWith({ lat: 38.8977, lng: -77.0365 }, undefined)
  })

  it('passes a valid label through', async () => {
    await GET(request('lat=38.8977&lng=-77.0365&q=The%20White%20House'))
    expect(buildInsights).toHaveBeenCalledWith(expect.anything(), 'The White House')
  })

  it('drops an oversized label rather than rejecting the request', async () => {
    await GET(request(`lat=38.8977&lng=-77.0365&q=${'x'.repeat(400)}`))
    expect(buildInsights).toHaveBeenCalledWith(expect.anything(), undefined)
  })

  it.each([
    ['missing both', ''],
    ['missing longitude', 'lat=38.8977'],
    ['non-numeric', 'lat=abc&lng=def'],
    ['latitude out of range', 'lat=91&lng=0'],
    ['longitude out of range', 'lat=0&lng=181'],
  ])('rejects %s with a 400 and never calls upstream', async (_label, query) => {
    const response = await GET(request(query))

    expect(response.status).toBe(400)
    expect(buildInsights).not.toHaveBeenCalled()
  })

  it('returns 502 when the aggregator throws', async () => {
    buildInsights.mockRejectedValue(new Error('everything is down'))

    const response = await GET(request('lat=38.8977&lng=-77.0365'))
    expect(response.status).toBe(502)
  })

  it('does not leak internal error text to the client', async () => {
    buildInsights.mockRejectedValue(new Error('CENSUS_API_KEY=secret-value-here rejected'))

    const response = await GET(request('lat=38.8977&lng=-77.0365'))
    const body = await response.json()

    expect(JSON.stringify(body)).not.toMatch(/secret-value-here/)
  })

  it('rate limits an aggressive client', async () => {
    let lastStatus = 200
    for (let i = 0; i < 20; i++) {
      lastStatus = (await GET(request('lat=38.8977&lng=-77.0365', '198.51.100.20'))).status
    }

    expect(lastStatus).toBe(429)
  })
})
