import type { Demographics } from '@/lib/types'

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const numberFormat = new Intl.NumberFormat('en-US')

export function DemographicsPanel({ demographics }: { demographics: Demographics }) {
  const rows = [
    {
      label: 'People',
      value: demographics.population === null ? null : numberFormat.format(demographics.population),
    },
    {
      label: 'Median age',
      value: demographics.medianAge === null ? null : demographics.medianAge.toFixed(1),
    },
    {
      label: 'Median income',
      value:
        demographics.medianHouseholdIncome === null
          ? null
          : currency.format(demographics.medianHouseholdIncome),
    },
    {
      label: 'Median home value',
      value:
        demographics.medianHomeValue === null ? null : currency.format(demographics.medianHomeValue),
    },
    {
      label: "Bachelor's or higher",
      value:
        demographics.bachelorsOrHigherPct === null ? null : `${demographics.bachelorsOrHigherPct}%`,
    },
    {
      label: 'Tract land area',
      value:
        demographics.landAreaSqMi === null ? null : `${demographics.landAreaSqMi.toFixed(2)} sq mi`,
    },
  ]

  return (
    <div className="slab px-6 py-6">
      <p className="tag bg-sea text-white">{demographics.tractName}</p>

      <dl className="mt-5 space-y-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4 rounded-xl border-[2.5px] border-ink bg-cream px-4 py-2.5"
          >
            <dt className="text-ink">{row.label}</dt>
            <dd className="shrink-0 font-display text-2xl font-extrabold text-ink">
              {row.value ?? <span className="text-base font-bold text-ink-faint">not reported</span>}
            </dd>
          </div>
        ))}
      </dl>

      {demographics.specialUse ? (
        <p className="mt-4 rounded-2xl border-[3px] border-ink bg-sun px-4 py-3 leading-relaxed text-ink">
          Heads up: this address falls in a Census special land-use tract, the kind used for parks,
          airports and large federal sites. Almost nobody is counted as living here, so these
          numbers describe the land rather than the neighborhood around it.
        </p>
      ) : null}

      <p className="mt-5 leading-relaxed text-ink-soft">
        American Community Survey {demographics.vintage} 5-year estimates, for the census tract this
        address sits in. Survey based, so these are estimates with margins of error rather than a
        headcount. Anything the Census suppresses shows as not reported.
      </p>
    </div>
  )
}
