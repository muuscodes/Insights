import type { Bird } from '@/lib/types'

const numberFormat = new Intl.NumberFormat('en-US')

export function BirdPanel({ birds }: { birds: Bird[] }) {
  if (birds.length === 0) {
    return (
      <div className="slab px-6 py-6">
        <p className="text-ink-soft leading-relaxed">
          No bird sightings logged within a mile in the last ten years. Either nobody around here
          submits records, or it really is that quiet.
        </p>
      </div>
    )
  }

  const most = birds[0]?.observations ?? 1

  return (
    <div className="slab px-6 py-6">
      <ol className="grid gap-3 sm:grid-cols-2">
        {birds.map((bird, index) => (
          <li
            key={bird.speciesKey}
            className="border-ink bg-cream rounded-2xl border-[3px] px-4 py-3"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="font-display text-ink-faint text-sm font-extrabold">
                  {index + 1}
                </span>
                <span className="font-display text-ink truncate text-lg font-extrabold">
                  {bird.commonName}
                </span>
              </span>
              <span className="font-display text-ink-soft shrink-0 text-sm font-extrabold">
                {numberFormat.format(bird.observations)}
              </span>
            </div>

            <div className="rounded-pill border-ink bg-card mt-2 h-3 w-full overflow-hidden border-2">
              <div
                className="fill bg-lime h-full"
                style={{ width: `${Math.max(6, (bird.observations / most) * 100)}%` }}
              />
            </div>

            <p className="text-ink-faint mt-1.5 truncate text-xs italic">{bird.scientificName}</p>
          </li>
        ))}
      </ol>

      <p className="text-ink-soft mt-5 leading-relaxed">
        The most-recorded species within a mile over the last ten years. Counts come from how often
        people submitted a sighting, so they track birdwatcher enthusiasm as much as bird numbers.
      </p>
    </div>
  )
}
