import { NextResponse } from 'next/server'

import { suggestAddresses } from '@/lib/providers/photon'
import { clientKey, rateLimit } from '@/lib/ratelimit'
import { suggestQuerySchema } from '@/lib/schemas'

/** Type-ahead fires often, so this ceiling is generous but still bounded. */
const LIMIT = 40
const WINDOW_MS = 60_000

export async function GET(request: Request): Promise<NextResponse> {
  const limited = rateLimit(`suggest:${clientKey(request)}`, LIMIT, WINDOW_MS)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } },
    )
  }

  const raw = new URL(request.url).searchParams.get('q') ?? ''
  const parsed = suggestQuerySchema.safeParse(raw)

  if (!parsed.success) {
    // Not an error worth surfacing: the user is still typing.
    return NextResponse.json({ suggestions: [], sawNonUsMatches: false })
  }

  try {
    const { suggestions, sawNonUsMatches } = await suggestAddresses(parsed.data)
    return NextResponse.json({ suggestions, sawNonUsMatches })
  } catch {
    // A dead autocomplete should not block the form.
    return NextResponse.json({ suggestions: [], sawNonUsMatches: false, degraded: true })
  }
}
