import 'server-only'

/**
 * Outbound HTTP helpers.
 *
 * Everything that leaves this app goes through here so that timeouts, retries
 * and cache policy are applied consistently. A hung upstream must never be able
 * to pin a serverless function until the platform kills it.
 */

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'UpstreamError'
  }
}

interface FetchOptions {
  /** Seconds Next should cache the response for. */
  revalidate: number
  timeoutMs?: number
  method?: 'GET' | 'POST'
  body?: string
  headers?: Record<string, string>
}

const DEFAULT_TIMEOUT_MS = 12_000

/**
 * Identify the app to public API operators. Overpass, Photon and Nominatim all
 * ask for this, and anonymous traffic is the first thing they rate limit.
 */
const USER_AGENT = 'address-insights/1.0 (interview project; +https://github.com)'

export async function fetchJson<T>(url: string, options: FetchOptions): Promise<T> {
  const { revalidate, timeoutMs = DEFAULT_TIMEOUT_MS, method = 'GET', body, headers = {} } = options

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method,
      body,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
        ...headers,
      },
      next: { revalidate },
    })

    if (!response.ok) {
      throw new UpstreamError(`Upstream responded ${response.status}`, response.status)
    }

    const text = await response.text()

    // Several of these APIs answer with an HTML error page and a 200 status
    // when they are throttling. Census in particular 302s to a "Missing Key"
    // HTML page. Fail loudly rather than handing back a broken object.
    const trimmed = text.trimStart()
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      throw new UpstreamError('Upstream returned a non-JSON body (likely throttled)')
    }

    return JSON.parse(trimmed) as T
  } catch (error) {
    if (error instanceof UpstreamError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new UpstreamError(`Upstream timed out after ${timeoutMs}ms`)
    }
    throw new UpstreamError(error instanceof Error ? error.message : 'Upstream request failed')
  } finally {
    clearTimeout(timer)
  }
}

/** Same guarantees as `fetchJson`, for endpoints that answer in plain text. */
export async function fetchText(url: string, options: FetchOptions): Promise<string> {
  const { revalidate, timeoutMs = DEFAULT_TIMEOUT_MS } = options

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
      next: { revalidate },
    })

    if (!response.ok) {
      throw new UpstreamError(`Upstream responded ${response.status}`, response.status)
    }

    return (await response.text()).trim()
  } catch (error) {
    if (error instanceof UpstreamError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new UpstreamError(`Upstream timed out after ${timeoutMs}ms`)
    }
    throw new UpstreamError(error instanceof Error ? error.message : 'Upstream request failed')
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Try each candidate in turn, returning the first success. Used for Overpass,
 * where the public instances rate limit aggressively and going down the mirror
 * list is the difference between a working page and an empty one.
 */
export async function firstSuccessful<T>(
  candidates: readonly string[],
  attempt: (candidate: string) => Promise<T>,
): Promise<T> {
  let lastError: unknown

  for (const candidate of candidates) {
    try {
      return await attempt(candidate)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new UpstreamError('All upstream candidates failed')
}
