import { Compass } from 'lucide-react'
import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[75vh] w-full max-w-xl flex-col items-center justify-center px-6 py-20 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-3xl bg-honey-wash text-honey">
        <Compass size={30} aria-hidden />
      </span>

      <h1 className="mt-6 font-display text-[clamp(2rem,6vw,3rem)] font-semibold leading-tight text-ink">
        We could not find that spot.
      </h1>
      <p className="mt-4 leading-relaxed text-ink-soft">
        Report pages are addressed by their coordinates, so a link that got clipped in half will not
        open. Start from a search and we will build you a fresh one.
      </p>

      <Link
        href="/info"
        className="mt-8 rounded-pill bg-berry px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-ink"
      >
        Look up an address
      </Link>
    </main>
  )
}
