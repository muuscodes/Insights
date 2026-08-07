import type { Bird } from '@/lib/types'

const numberFormat = new Intl.NumberFormat('en-US')

export function BirdPanel({ birds }: { birds: Bird[] }) {
  if (birds.length === 0) {
    return (
      <div className="card px-6 py-7">
        <p className="text-sm leading-relaxed text-ink-soft">
          No bird sightings logged within a mile in the last ten years. Either nobody around here
          submits records, or it really is that quiet.
        </p>
      </div>
    )
  }

  const most = birds[0]?.observations ?? 1

  return (
    <div className="card px-6 py-7">
      <ol className="grid gap-3 sm:grid-cols-2">
        {birds.map((bird) => (
          <li key={bird.speciesKey} className="rounded-2xl bg-cream-deep px-4 py-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate font-medium text-ink">{bird.commonName}</span>
              <span className="shrink-0 text-sm text-ink-soft">
                {numberFormat.format(bird.observations)}
              </span>
            </div>

            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-white">
              <div
                className="sweep h-full rounded-pill bg-leaf"
                style={{ width: `${Math.max(4, (bird.observations / most) * 100)}%` }}
              />
            </div>

            <p className="mt-1.5 truncate text-xs italic text-ink-faint">{bird.scientificName}</p>
          </li>
        ))}
      </ol>

      <p className="mt-5 text-sm leading-relaxed text-ink-soft">
        The most-recorded species within a mile over the last ten years. Counts come from how often
        people submitted a sighting, so they track birdwatcher enthusiasm as much as bird numbers.
      </p>
    </div>
  )
}
