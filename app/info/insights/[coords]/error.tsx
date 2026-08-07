'use client'

import { CloudOff } from 'lucide-react'
import Link from 'next/link'
import { useEffect } from 'react'

export default function InsightsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Insights page failed', error)
  }, [error])

  return (
    <main className="mx-auto flex min-h-[75vh] w-full max-w-xl flex-col items-center justify-center px-6 py-20 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-3xl bg-berry-wash text-berry">
        <CloudOff size={30} aria-hidden />
      </span>

      <h1 className="mt-6 font-display text-[clamp(2rem,6vw,3rem)] font-semibold leading-tight text-ink">
        That one did not come together.
      </h1>
      <p className="mt-4 leading-relaxed text-ink-soft">
        The open map services behind this are free, and they occasionally get busy and turn us away.
        Trying again usually sorts it, and once an address works it stays quick.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-pill bg-berry px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-ink"
        >
          Try again
        </button>
        <Link
          href="/info"
          className="rounded-pill border border-edge-strong px-6 py-3 text-sm font-medium text-ink transition-colors hover:bg-cream-deep"
        >
          New search
        </Link>
      </div>
    </main>
  )
}
