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
      label: 'Median household income',
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
    <div className="card px-6 py-7">
      <p className="chip bg-sky-wash text-sky">{demographics.tractName}</p>

      <dl className="mt-5 space-y-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4 rounded-2xl bg-cream-deep px-4 py-3"
          >
            <dt className="text-sm text-ink-soft">{row.label}</dt>
            <dd className="shrink-0 font-display text-xl font-semibold text-ink">
              {row.value ?? <span className="text-sm font-normal text-ink-faint">not reported</span>}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-5 text-sm leading-relaxed text-ink-soft">
        American Community Survey {demographics.vintage} 5-year estimates, for the census tract this
        address sits in. Survey based, so these are estimates with margins of error rather than a
        headcount. Anything the Census suppresses shows as not reported.
      </p>
    </div>
  )
}
