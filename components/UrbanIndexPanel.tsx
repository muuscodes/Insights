import type { UrbanIndex } from '@/lib/types'

const BANDS = ['Rural', 'Suburban', 'Urban', 'Urban Core'] as const

const numberFormat = new Intl.NumberFormat('en-US')

export function UrbanIndexPanel({ urban }: { urban: UrbanIndex }) {
  return (
    <div className="card px-6 py-7">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex items-end gap-4">
          <span className="font-display text-[5rem] font-semibold leading-[0.8] text-plum">
            {urban.index}
          </span>
          <p className="pb-2 text-sm text-ink-faint">out of 100</p>
        </div>

        <span className="chip bg-plum-wash px-4 py-2 font-display text-2xl font-semibold text-plum">
          {urban.label}
        </span>
      </div>

      <div className="mt-7">
        <div className="relative h-2.5 w-full overflow-hidden rounded-pill bg-cream-deep">
          <div
            className="sweep h-full rounded-pill bg-plum"
            style={{ width: `${Math.max(urban.index, 2)}%` }}
          />
        </div>
        <div className="mt-2.5 grid grid-cols-4">
          {BANDS.map((band) => (
            <span
              key={band}
              className={`text-xs ${band === urban.label ? 'font-semibold text-plum' : 'text-ink-faint'}`}
            >
              {band}
            </span>
          ))}
        </div>
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-4">
        <div className="rounded-2xl bg-cream-deep px-4 py-4">
          <dt className="text-sm text-ink-soft">Amenities per sq mile</dt>
          <dd className="mt-1 font-display text-3xl font-semibold leading-none text-ink">
            {numberFormat.format(urban.poiPerSqMi)}
          </dd>
        </div>
        <div className="rounded-2xl bg-cream-deep px-4 py-4">
          <dt className="text-sm text-ink-soft">Residents per sq mile</dt>
          <dd className="mt-1 font-display text-3xl font-semibold leading-none text-ink">
            {urban.popPerSqMi === null ? 'n/a' : numberFormat.format(urban.popPerSqMi)}
          </dd>
        </div>
      </dl>

      <p className="mt-5 text-sm leading-relaxed text-ink-soft">
        {urban.poiOnly
          ? 'Worked out from amenity density alone. Census population was unavailable for this tract, so the residential half of the index is missing.'
          : 'Averages how many amenities sit inside the 1-mile circle with how many people live in the surrounding census tract. Two inputs, because either one on its own misreads a place.'}
      </p>
    </div>
  )
}
