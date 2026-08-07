import { Compass } from 'lucide-react'
import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[75vh] w-full max-w-xl flex-col items-center justify-center px-6 py-20 text-center">
      <span className="pop grid h-20 w-20 place-items-center rounded-3xl border-[3px] border-ink bg-sun text-ink shadow-[0_6px_0_var(--color-ink)]">
        <Compass size={36} strokeWidth={2.75} aria-hidden />
      </span>

      <h1 className="mt-8 text-[clamp(2rem,7vw,3.25rem)] leading-tight text-ink">
        We could not find that spot.
      </h1>
      <p className="mt-4 leading-relaxed text-ink-soft">
        Report pages are addressed by their coordinates, so a link that got clipped in half will not
        open. Start from a search and we will build you a fresh one.
      </p>

      <Link
        href="/info"
        className="slab-press mt-8 rounded-pill border-[3px] border-ink bg-berry px-7 py-3 font-display text-lg font-extrabold text-white shadow-[0_5px_0_var(--color-berry-deep)]"
      >
        Look up an address
      </Link>
    </main>
  )
}
