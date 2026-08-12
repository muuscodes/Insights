import type { UrbanIndex } from '@/lib/types'

const BANDS = ['Rural', 'Suburban', 'Urban', 'Urban Core'] as const

const numberFormat = new Intl.NumberFormat('en-US')

export function UrbanIndexPanel({ urban }: { urban: UrbanIndex }) {
  return (
    <div className="slab px-6 py-6">
      <div className="flex flex-wrap items-center gap-5">
        {/*
          Grape is the one accent where neither white nor ink clears 4.5:1, so
          it carries large text only. At 68px this is comfortably large text,
          where the bar is 3:1 and ink measures 4.03:1.
        */}
        <div className="pop border-ink bg-grape grid min-w-28 place-items-center rounded-2xl border-[3px] px-5 py-4 shadow-[0_6px_0_var(--color-grape-deep)]">
          <span className="numeral text-ink text-[4.25rem]">{urban.index}</span>
        </div>

        <div>
          <p className="font-display text-ink text-3xl leading-tight font-extrabold">
            {urban.label}
          </p>
          <p className="text-ink-soft mt-0.5 text-sm">out of 100</p>
        </div>
      </div>

      <div className="mt-6">
        <div className="rounded-pill border-ink bg-cream-deep h-4 w-full overflow-hidden border-[3px]">
          <div className="fill bg-grape h-full" style={{ width: `${Math.max(urban.index, 3)}%` }} />
        </div>
        <div className="mt-2 grid grid-cols-4">
          {BANDS.map((band) => (
            <span
              key={band}
              // grape-deep, not grape: at 12px this is small text, and plain
              // grape is only 4.06:1 on the card. grape-deep is 6.66:1.
              className={`font-display text-xs font-bold ${
                band === urban.label ? 'text-grape-deep' : 'text-ink-faint'
              }`}
            >
              {band}
            </span>
          ))}
        </div>
      </div>

      <dl className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="border-ink bg-sun rounded-2xl border-[3px] px-4 py-3.5">
          <dt className="text-ink text-sm">Amenities per sq mile</dt>
          <dd className="numeral text-ink mt-1 text-4xl">
            {numberFormat.format(urban.poiPerSqMi)}
          </dd>
        </div>
        <div className="border-ink bg-sea rounded-2xl border-[3px] px-4 py-3.5">
          <dt className="text-ink text-sm">Residents per sq mile</dt>
          <dd className="numeral text-ink mt-1 text-4xl">
            {urban.popPerSqMi === null ? 'n/a' : numberFormat.format(urban.popPerSqMi)}
          </dd>
        </div>
      </dl>

      <p className="text-ink-soft mt-5 leading-relaxed">
        {urban.poiOnly
          ? 'Worked out from amenity density alone. The census tract here reports too few residents to be meaningful, which happens on parkland and federal sites, so the residential half of the index is left out rather than dragging the answer somewhere silly.'
          : 'Averages how many amenities sit inside the 1-mile circle with how many people live in the surrounding census tract. Two inputs, because either one on its own misreads a place.'}
      </p>
    </div>
  )
}
