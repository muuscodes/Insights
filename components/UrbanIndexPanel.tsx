import type { UrbanIndex } from '@/lib/types'

const BANDS = ['Rural', 'Suburban', 'Urban', 'Urban Core'] as const

const numberFormat = new Intl.NumberFormat('en-US')

export function UrbanIndexPanel({ urban }: { urban: UrbanIndex }) {
  return (
    <div className="slab px-6 py-6">
      <div className="flex flex-wrap items-center gap-5">
        <div className="pop grid min-w-28 place-items-center rounded-2xl border-[3px] border-ink bg-grape px-5 py-4 shadow-[0_6px_0_var(--color-grape-deep)]">
          <span className="numeral text-[4.25rem] text-white">{urban.index}</span>
        </div>

        <div>
          <p className="font-display text-3xl font-extrabold leading-tight text-ink">
            {urban.label}
          </p>
          <p className="mt-0.5 text-sm text-ink-soft">out of 100</p>
        </div>
      </div>

      <div className="mt-6">
        <div className="h-4 w-full overflow-hidden rounded-pill border-[3px] border-ink bg-cream-deep">
          <div className="fill h-full bg-grape" style={{ width: `${Math.max(urban.index, 3)}%` }} />
        </div>
        <div className="mt-2 grid grid-cols-4">
          {BANDS.map((band) => (
            <span
              key={band}
              className={`font-display text-xs font-bold ${
                band === urban.label ? 'text-grape' : 'text-ink-faint'
              }`}
            >
              {band}
            </span>
          ))}
        </div>
      </div>

      <dl className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border-[3px] border-ink bg-sun px-4 py-3.5">
          <dt className="text-sm text-ink">Amenities per sq mile</dt>
          <dd className="numeral mt-1 text-4xl text-ink">
            {numberFormat.format(urban.poiPerSqMi)}
          </dd>
        </div>
        <div className="rounded-2xl border-[3px] border-ink bg-sea px-4 py-3.5">
          <dt className="text-sm text-white">Residents per sq mile</dt>
          <dd className="numeral mt-1 text-4xl text-white">
            {urban.popPerSqMi === null ? 'n/a' : numberFormat.format(urban.popPerSqMi)}
          </dd>
        </div>
      </dl>

      <p className="mt-5 leading-relaxed text-ink-soft">
        {urban.poiOnly
          ? 'Worked out from amenity density alone. The census tract here reports too few residents to be meaningful, which happens on parkland and federal sites, so the residential half of the index is left out rather than dragging the answer somewhere silly.'
          : 'Averages how many amenities sit inside the 1-mile circle with how many people live in the surrounding census tract. Two inputs, because either one on its own misreads a place.'}
      </p>
    </div>
  )
}
