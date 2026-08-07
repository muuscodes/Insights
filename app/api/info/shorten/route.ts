import { NextResponse } from 'next/server'

import { fetchJson } from '@/lib/http'
import { clientKey, rateLimit } from '@/lib/ratelimit'

/**
 * Shorten a report link.
 *
 * The client sends a path, never a full URL, and the absolute URL is rebuilt
 * here from this deployment's own origin. That matters: accepting a URL from
 * the caller would turn this route into an open URL shortener that anyone could
 * point at anything, with our deployment taking the blame for the traffic.
 *
 * Uses TinyURL's v2 API. The old `tinyurl.com/api-create.php` endpoint needs no
 * token and does still answer, but it is deprecated and not worth building on.
 * v2 wants a token, free from https://tinyurl.com/app/settings/api.
 *
 * Shortening stays optional on purpose. With no token configured this returns
 * the full URL and reports `shortened: false`, the copy button copies that, and
 * nothing breaks. A share button should not be the thing that forces a second
 * API key on the deployment.
 */

const TINYURL_ENDPOINT = 'https://api.tinyurl.com/create'

const LIMIT = 20
const WINDOW_MS = 60_000

const CACHE_SECONDS = 60 * 60 * 24 * 30

/** Only report pages are shortenable. */
const SHORTENABLE = /^\/info\/insights\//

interface TinyUrlResponse {
  data?: { tiny_url?: string }
  errors?: string[]
}

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
  const token = process.env.TINYURL_API_TOKEN

  if (!token || !isPubliclyReachable(origin)) {
    return NextResponse.json({ url: longUrl, shortened: false })
  }

  try {
    const response = await fetchJson<TinyUrlResponse>(TINYURL_ENDPOINT, {
      revalidate: CACHE_SECONDS,
      timeoutMs: 6000,
      method: 'POST',
      body: JSON.stringify({ url: longUrl }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })

    const short = response.data?.tiny_url
    if (!short || !short.startsWith('https://')) {
      return NextResponse.json({ url: longUrl, shortened: false })
    }

    return NextResponse.json({ url: short, shortened: true })
  } catch {
    // Shortening is a convenience. The full URL works perfectly well.
    return NextResponse.json({ url: longUrl, shortened: false })
  }
}
