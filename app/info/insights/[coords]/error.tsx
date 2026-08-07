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
      <span className="pop border-ink bg-berry grid h-20 w-20 place-items-center rounded-3xl border-[3px] text-white shadow-[0_6px_0_var(--color-berry-deep)]">
        <CloudOff size={36} strokeWidth={2.75} aria-hidden />
      </span>

      <h1 className="text-ink mt-8 text-[clamp(2rem,7vw,3.25rem)] leading-tight">
        That one did not come together.
      </h1>
      <p className="text-ink-soft mt-4 leading-relaxed">
        The open map services behind this are free, and they occasionally get busy and turn us away.
        Trying again usually sorts it, and once an address works it stays quick.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="slab-press rounded-pill border-ink bg-lime font-display text-ink border-[3px] px-7 py-3 text-lg font-extrabold shadow-[0_5px_0_var(--color-lime-deep)]"
        >
          Try again
        </button>
        <Link
          href="/info"
          className="slab-press rounded-pill border-ink bg-card font-display text-ink border-[3px] px-7 py-3 text-lg font-extrabold shadow-[0_5px_0_var(--color-ink)]"
        >
          New search
        </Link>
      </div>
    </main>
  )
}
