import 'server-only'

/**
 * Fixed-window rate limiter, in process memory.
 *
 * Honest about what this is: on Vercel each serverless instance keeps its own
 * counter, so the effective limit across a scaled-out deployment is higher than
 * the number configured here. It is enough to stop one client hammering the
 * upstream providers we depend on (Overpass in particular will ban an abusive
 * origin), and it costs no extra infrastructure. A shared store such as Upstash
 * Redis is the drop-in upgrade if this ever needed to be exact.
 */

interface Window {
  count: number
  resetAt: number
}

const windows = new Map<string, Window>()

/** Bound the map so a flood of unique IPs cannot grow it without limit. */
const MAX_TRACKED_KEYS = 10_000

function sweep(now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key)
  }
}

export interface RateLimitResult {
  ok: boolean
  /** Seconds until the window resets. Only meaningful when `ok` is false. */
  retryAfter: number
  remaining: number
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()

  if (windows.size > MAX_TRACKED_KEYS) sweep(now)

  const existing = windows.get(key)

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfter: 0, remaining: limit - 1 }
  }

  existing.count += 1

  if (existing.count > limit) {
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      remaining: 0,
    }
  }

  return { ok: true, retryAfter: 0, remaining: limit - existing.count }
}

/**
 * Best-effort client identity. `x-forwarded-for` is spoofable in general, but
 * on Vercel the edge overwrites it, so the leftmost entry is the real client.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  return first || request.headers.get('x-real-ip') || 'unknown'
}

/** Test seam: the limiter is module-level state shared across requests. */
export function __resetRateLimitForTests(): void {
  windows.clear()
}
