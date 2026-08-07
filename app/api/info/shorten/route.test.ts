import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetRateLimitForTests } from '@/lib/ratelimit'

const fetchJson = vi.fn()

vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>()
  return { ...actual, fetchJson: (...args: unknown[]) => fetchJson(...args) }
})

const { GET } = await import('./route')

const request = (path: string, host = 'insights.example.com', ip = '203.0.113.3') =>
  new Request(`https://${host}/api/info/shorten?path=${encodeURIComponent(path)}`, {
    headers: { 'x-forwarded-host': host, 'x-forwarded-proto': 'https', 'x-forwarded-for': ip },
  })

const REPORT_PATH = '/info/insights/37.759900,-122.414800?q=Mission'
const FULL_URL = 'https://insights.example.com/info/insights/37.759900,-122.414800?q=Mission'

beforeEach(() => {
  __resetRateLimitForTests()
  fetchJson.mockReset()
  fetchJson.mockResolvedValue({ data: { tiny_url: 'https://tinyurl.com/abc1234' } })
  vi.stubEnv('TINYURL_API_TOKEN', 'test-token')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('GET /api/info/shorten', () => {
  it('shortens a report path through the v2 API', async () => {
    const body = await (await GET(request(REPORT_PATH))).json()

    expect(body).toEqual({ url: 'https://tinyurl.com/abc1234', shortened: true })

    // v2, not the deprecated tinyurl.com/api-create.php endpoint.
    const [url, options] = fetchJson.mock.calls[0] as [string, Record<string, unknown>]
    expect(url).toBe('https://api.tinyurl.com/create')
    expect(options.method).toBe('POST')
    expect((options.headers as Record<string, string>).Authorization).toBe('Bearer test-token')

    // It must send TinyURL an absolute URL built from OUR origin.
    expect(JSON.parse(options.body as string).url).toBe(FULL_URL)
  })

  it('returns the full URL, unshortened, when no token is configured', async () => {
    // The point of keeping this optional: the app needs no second API key.
    vi.stubEnv('TINYURL_API_TOKEN', '')

    const body = await (await GET(request(REPORT_PATH))).json()

    expect(body.shortened).toBe(false)
    expect(body.url).toBe(FULL_URL)
    expect(fetchJson).not.toHaveBeenCalled()
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
    expect(fetchJson).not.toHaveBeenCalled()
  })

  it('does not call TinyURL for a host it could never resolve', async () => {
    for (const host of ['localhost:3000', '127.0.0.1:3000', 'dev.local']) {
      fetchJson.mockClear()
      const body = await (await GET(request(REPORT_PATH, host))).json()

      expect(body.shortened, host).toBe(false)
      expect(body.url, host).toContain('/info/insights/')
      expect(fetchJson, host).not.toHaveBeenCalled()
    }
  })

  it('falls back to the full URL when TinyURL fails', async () => {
    fetchJson.mockRejectedValue(new Error('tinyurl down'))

    const body = await (await GET(request(REPORT_PATH))).json()

    expect(body.shortened).toBe(false)
    expect(body.url).toBe(FULL_URL)
  })

  it('falls back when the response carries no tiny_url', async () => {
    fetchJson.mockResolvedValue({ data: {}, errors: ['Unauthenticated.'] })

    const body = await (await GET(request(REPORT_PATH))).json()

    expect(body.shortened).toBe(false)
    expect(body.url).toBe(FULL_URL)
  })

  it('rate limits an aggressive client', async () => {
    let lastStatus = 200
    for (let i = 0; i < 25; i++) {
      lastStatus = (await GET(request(REPORT_PATH, 'insights.example.com', '198.51.100.30'))).status
    }
    expect(lastStatus).toBe(429)
  })
})
