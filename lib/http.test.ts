import { afterEach, describe, expect, it, vi } from 'vitest'

import { UpstreamError, fetchJson, firstSuccessful } from './http'

afterEach(() => {
  vi.restoreAllMocks()
})

function mockFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const spy = vi.fn(impl as unknown as typeof fetch)
  vi.stubGlobal('fetch', spy)
  return spy
}

describe('fetchJson', () => {
  it('parses a JSON body', async () => {
    mockFetch(async () => new Response('{"ok":true}', { status: 200 }))
    await expect(fetchJson('https://example.test', { revalidate: 60 })).resolves.toEqual({
      ok: true,
    })
  })

  it('parses a top-level JSON array, which the Census Data API returns', async () => {
    mockFetch(async () => new Response('[["NAME"],["Census Tract 1"]]', { status: 200 }))
    await expect(fetchJson('https://example.test', { revalidate: 60 })).resolves.toEqual([
      ['NAME'],
      ['Census Tract 1'],
    ])
  })

  it('throws on a non-2xx status and keeps the status code', async () => {
    mockFetch(async () => new Response('nope', { status: 429 }))
    await expect(fetchJson('https://example.test', { revalidate: 60 })).rejects.toMatchObject({
      name: 'UpstreamError',
      status: 429,
    })
  })

  it('rejects an HTML body served with a 200, which is how these APIs throttle', async () => {
    // The Census Data API answers a keyless request by redirecting to an HTML
    // "Missing Key" page, and Overpass serves an HTML notice when rate limited.
    mockFetch(async () => new Response('<html><title>Missing Key</title></html>', { status: 200 }))
    await expect(fetchJson('https://example.test', { revalidate: 60 })).rejects.toThrow(/non-JSON/)
  })

  it('aborts and reports a timeout when the upstream hangs', async () => {
    mockFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          })
        }),
    )

    await expect(
      fetchJson('https://example.test', { revalidate: 60, timeoutMs: 20 }),
    ).rejects.toThrow(/timed out/)
  })

  it('sends a User-Agent, which these public APIs ask for', async () => {
    const spy = mockFetch(async () => new Response('{}', { status: 200 }))
    await fetchJson('https://example.test', { revalidate: 60 })

    const headers = spy.mock.calls[0]?.[1]?.headers as Record<string, string>
    expect(headers['User-Agent']).toMatch(/address-insights/)
  })

  it('passes the cache policy through to Next', async () => {
    const spy = mockFetch(async () => new Response('{}', { status: 200 }))
    await fetchJson('https://example.test', { revalidate: 86_400 })

    const init = spy.mock.calls[0]?.[1] as RequestInit & { next?: { revalidate: number } }
    expect(init.next?.revalidate).toBe(86_400)
  })
})

describe('firstSuccessful', () => {
  it('returns the first candidate that works', async () => {
    const attempted: string[] = []
    const result = await firstSuccessful(['a', 'b', 'c'], async (candidate) => {
      attempted.push(candidate)
      return candidate.toUpperCase()
    })

    expect(result).toBe('A')
    expect(attempted).toEqual(['a'])
  })

  it('falls through to a later mirror when earlier ones fail', async () => {
    // Reproduces what actually happens with Overpass: the main host refuses,
    // a mirror answers.
    const attempted: string[] = []
    const result = await firstSuccessful(['dead', 'alsoDead', 'alive'], async (candidate) => {
      attempted.push(candidate)
      if (candidate !== 'alive') throw new UpstreamError('rate limited', 429)
      return 'data'
    })

    expect(result).toBe('data')
    expect(attempted).toEqual(['dead', 'alsoDead', 'alive'])
  })

  it('rethrows the last error when every candidate fails', async () => {
    await expect(
      firstSuccessful(['a', 'b'], async () => {
        throw new UpstreamError('all down')
      }),
    ).rejects.toThrow('all down')
  })
})
