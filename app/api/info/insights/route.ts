import { NextResponse } from 'next/server'

import { buildInsights } from '@/lib/insights'
import { clientKey, rateLimit } from '@/lib/ratelimit'
import { coordParamsSchema, labelSchema } from '@/lib/schemas'

/**
 * JSON view of the same payload the insights page renders.
 *
 * The page itself is a server component that calls `buildInsights` directly, so
 * this route is not on the critical path. It exists so the data is inspectable
 * and so the scoring can be exercised without scraping HTML.
 */

/** Matches the report page: a cold build can legitimately take ~30s. */
export const maxDuration = 60

/** Each call can fan out to several upstream providers, so keep this tight. */
const LIMIT = 15
const WINDOW_MS = 60_000

export async function GET(request: Request): Promise<NextResponse> {
  const limited = rateLimit(`insights:${clientKey(request)}`, LIMIT, WINDOW_MS)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } },
    )
  }

  const params = new URL(request.url).searchParams

  const coords = coordParamsSchema.safeParse({
    lat: params.get('lat') ?? undefined,
    lng: params.get('lng') ?? undefined,
  })

  if (!coords.success) {
    return NextResponse.json(
      { error: 'lat and lng are required and must be valid coordinates.' },
      { status: 400 },
    )
  }

  const labelParam = params.get('q')
  const label = labelParam ? labelSchema.safeParse(labelParam) : null

  try {
    const payload = await buildInsights(coords.data, label?.success ? label.data : undefined)
    return NextResponse.json(payload)
  } catch {
    return NextResponse.json(
      { error: 'Could not build insights for that location.' },
      { status: 502 },
    )
  }
}
