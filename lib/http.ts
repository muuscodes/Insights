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

/**
 * Try each candidate in turn, returning the first success.
 *
 * Used for ACS release years, where trying the second candidate is only correct
 * once the first has genuinely failed. For mirrors of the same service, prefer
 * `hedgedRace`, which does not make a healthy request wait behind a sick one.
 */
export async function firstSuccessful<T, C>(
  candidates: readonly C[],
  attempt: (candidate: C) => Promise<T>,
): Promise<T> {
  let lastError: unknown

  for (const candidate of candidates) {
    try {
      return await attempt(candidate)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new UpstreamError('All upstream candidates failed')
}

/**
 * Race interchangeable mirrors, staggered.
 *
 * Walking a mirror list in order makes every request wait out the slowest sick
 * mirror before it may try a healthy one, and that, not query cost, was what
 * made cold reports slow. Measured on the same query within a minute of each
 * other: overpass-api.de answered in 4.1s, kumi.systems in 9.0s, and
 * private.coffee spent 32.5s arriving at a 504.
 *
 * So the first candidate gets a head start of `hedgeMs`, and if it has not
 * answered by then the second is launched alongside it rather than instead of
 * it. First success wins and the rest are abandoned. A failure launches the
 * next immediately rather than waiting out the stagger.
 *
 * The cost is some duplicate load on a free service when the leader is slow,
 * which is why `hedgeMs` should sit above the normal success time rather than
 * below it. It only pays out when something is actually wrong.
 */
export function hedgedRace<T, C>(
  candidates: readonly C[],
  attempt: (candidate: C) => Promise<T>,
  hedgeMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (candidates.length === 0) {
      reject(new UpstreamError('No upstream candidates to try'))
      return
    }

    const timers: ReturnType<typeof setTimeout>[] = []
    let settled = false
    let next = 0
    let failures = 0
    let lastError: unknown

    const cleanup = (): void => {
      for (const timer of timers) clearTimeout(timer)
    }

    const launch = (): void => {
      if (settled || next >= candidates.length) return

      // Taking the index here, rather than passing one in, is what keeps the
      // stagger timer and the failure path from launching the same mirror twice.
      const candidate = candidates[next++] as C

      if (next < candidates.length) timers.push(setTimeout(launch, hedgeMs))

      attempt(candidate).then(
        (value) => {
          if (settled) return
          settled = true
          cleanup()
          resolve(value)
        },
        (error) => {
          lastError = error
          failures += 1
          if (settled) return

          if (failures >= candidates.length) {
            settled = true
            cleanup()
            reject(
              lastError instanceof Error
                ? lastError
                : new UpstreamError('All upstream candidates failed'),
            )
            return
          }

          launch()
        },
      )
    }

    launch()
  })
}
