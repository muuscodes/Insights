import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetRateLimitForTests } from '@/lib/ratelimit'

const fetchText = vi.fn()

vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>()
  return { ...actual, fetchText: (...args: unknown[]) => fetchText(...args) }
})

const { GET } = await import('./route')

const request = (path: string, host = 'insights.example.com', ip = '203.0.113.3') =>
  new Request(`https://${host}/api/info/shorten?path=${encodeURIComponent(path)}`, {
    headers: { 'x-forwarded-host': host, 'x-forwarded-proto': 'https', 'x-forwarded-for': ip },
  })

const REPORT_PATH = '/info/insights/37.759900,-122.414800?q=Mission'

beforeEach(() => {
  __resetRateLimitForTests()
  fetchText.mockReset()
  fetchText.mockResolvedValue('https://tinyurl.com/abc1234')
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/info/shorten', () => {
  it('shortens a report path', async () => {
    const body = await (await GET(request(REPORT_PATH))).json()

    expect(body).toEqual({ url: 'https://tinyurl.com/abc1234', shortened: true })

    // It must send TinyURL an absolute URL built from OUR origin.
    const sent = String(fetchText.mock.calls[0]?.[0])
    expect(sent).toContain(encodeURIComponent('https://insights.example.com/info/insights/'))
  })

  it.each([
    ['protocol-relative URL pointing off-site', '//evil.example.com/info/insights/1,2'],
    ['absolute URL to another origin', 'https://evil.example.com/info/insights/1,2'],
    ['a path outside the report route', '/api/info/insights?lat=1&lng=2'],
    ['the home page', '/info'],
    ['an empty path', ''],
  ])('refuses to shorten %s', async (_label, path) => {
    const response = await GET(request(path))

    expect(response.status).toBe(400)
    // The whole point: never let this become an open URL shortener.
    expect(fetchText).not.toHaveBeenCalled()
  })

  it('does not call TinyURL for a host it could never resolve', async () => {
    for (const host of ['localhost:3000', '127.0.0.1:3000', 'dev.local']) {
      fetchText.mockClear()
      const body = await (await GET(request(REPORT_PATH, host))).json()

      expect(body.shortened, host).toBe(false)
      expect(body.url, host).toContain('/info/insights/')
      expect(fetchText, host).not.toHaveBeenCalled()
    }
  })

  it('falls back to the full URL when TinyURL fails', async () => {
    fetchText.mockRejectedValue(new Error('tinyurl down'))

    const body = await (await GET(request(REPORT_PATH))).json()

    expect(body.shortened).toBe(false)
    expect(body.url).toBe('https://insights.example.com/info/insights/37.759900,-122.414800?q=Mission')
  })

  it('falls back when TinyURL answers with something unexpected', async () => {
    fetchText.mockResolvedValue('Error: invalid url')

    const body = await (await GET(request(REPORT_PATH))).json()
    expect(body.shortened).toBe(false)
    expect(body.url).toContain('insights.example.com')
  })

  it('rate limits an aggressive client', async () => {
    let lastStatus = 200
    for (let i = 0; i < 25; i++) {
      lastStatus = (await GET(request(REPORT_PATH, 'insights.example.com', '198.51.100.30'))).status
    }
    expect(lastStatus).toBe(429)
  })
})
