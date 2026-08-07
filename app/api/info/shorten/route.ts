import { NextResponse } from 'next/server'

import { fetchText } from '@/lib/http'
import { clientKey, rateLimit } from '@/lib/ratelimit'

/**
 * Shorten a report link with TinyURL.
 *
 * The client sends a path, never a full URL, and the absolute URL is rebuilt
 * here from this deployment's own origin. That matters: accepting a URL from
 * the caller would turn this route into an open URL shortener that anyone could
 * point at anything, with our deployment taking the blame for the traffic.
 *
 * TinyURL's legacy endpoint needs no key and answers in plain text.
 */

const TINYURL_ENDPOINT = 'https://tinyurl.com/api-create.php'

const LIMIT = 20
const WINDOW_MS = 60_000

const CACHE_SECONDS = 60 * 60 * 24 * 30

/** Only report pages are shortenable. */
const SHORTENABLE = /^\/info\/insights\//

function originOf(request: Request): string | null {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (!host) return null
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  return `${proto}://${host}`
}

/** TinyURL cannot resolve a private host, so do not bother asking. */
function isPubliclyReachable(origin: string): boolean {
  try {
    const { hostname } = new URL(origin)
    if (hostname === 'localhost' || hostname.endsWith('.local')) return false
    if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)/.test(hostname)) return false
    return hostname.includes('.')
  } catch {
    return false
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  const limited = rateLimit(`shorten:${clientKey(request)}`, LIMIT, WINDOW_MS)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } },
    )
  }

  const path = new URL(request.url).searchParams.get('path') ?? ''
  const origin = originOf(request)
  if (!origin) return NextResponse.json({ error: 'Unknown origin.' }, { status: 400 })

  let absolute: URL
  try {
    absolute = new URL(path, origin)
  } catch {
    return NextResponse.json({ error: 'Invalid path.' }, { status: 400 })
  }

  // `new URL('//evil.example', origin)` resolves to a different origin, so
  // compare the resolved origin rather than trusting the string started with a
  // slash.
  if (absolute.origin !== origin || !SHORTENABLE.test(absolute.pathname)) {
    return NextResponse.json({ error: 'That path cannot be shortened.' }, { status: 400 })
  }

  const longUrl = absolute.toString()

  if (!isPubliclyReachable(origin)) {
    return NextResponse.json({ url: longUrl, shortened: false })
  }

  try {
    const short = await fetchText(
      `${TINYURL_ENDPOINT}?url=${encodeURIComponent(longUrl)}`,
      { revalidate: CACHE_SECONDS, timeoutMs: 6000 },
    )

    if (!short.startsWith('https://tinyurl.com/')) {
      return NextResponse.json({ url: longUrl, shortened: false })
    }

    return NextResponse.json({ url: short, shortened: true })
  } catch {
    // Shortening is a convenience. The full URL works perfectly well.
    return NextResponse.json({ url: longUrl, shortened: false })
  }
}
