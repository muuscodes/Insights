import { Car, Footprints } from 'lucide-react'

import { formatDistance, walkMinutes } from '@/lib/geo'
import type { ScoreResult } from '@/lib/types'

/** Colour the headline number by how good the score actually is. */
function toneFor(score: number): { text: string; bar: string; wash: string } {
  if (score >= 70) return { text: 'text-leaf', bar: 'bg-leaf', wash: 'bg-leaf-wash' }
  if (score >= 40) return { text: 'text-honey', bar: 'bg-honey', wash: 'bg-honey-wash' }
  return { text: 'text-berry', bar: 'bg-berry', wash: 'bg-berry-wash' }
}

export function ScoreMeter({
  kind,
  result,
  showWalkTimes,
}: {
  kind: 'Walking' | 'Driving'
  result: ScoreResult
  showWalkTimes: boolean
}) {
  const tone = toneFor(result.score)
  const Icon = kind === 'Walking' ? Footprints : Car
  const top = result.breakdown.filter((row) => row.count > 0).slice(0, 6)

  return (
    <div className="card px-6 py-7">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-base font-medium text-ink">
          <Icon size={18} className={tone.text} aria-hidden />
          {kind}
        </span>
        <span className="chip bg-cream-deep text-ink-soft">{result.radiusMi} mile radius</span>
      </div>

      <div className="mt-5 flex items-end gap-4">
        <span className={`font-display text-[5rem] font-semibold leading-[0.8] ${tone.text}`}>
          {result.score}
        </span>
        <div className="pb-2">
          <p className="text-sm text-ink-faint">out of 100</p>
          <p className="text-lg font-medium text-ink">{result.label}</p>
        </div>
      </div>

      <div className="mt-6 h-2.5 w-full overflow-hidden rounded-pill bg-cream-deep">
        <div
          className={`sweep h-full rounded-pill ${tone.bar}`}
          style={{ width: `${Math.max(result.score, 2)}%` }}
          role="meter"
          aria-valuenow={result.score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${kind} score`}
        />
      </div>

      {top.length > 0 ? (
        <dl className="mt-7 space-y-3.5">
          {top.map((row) => (
            <div key={row.key} className="grid grid-cols-[1fr_auto] items-center gap-3">
              <dt className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: row.color }}
                />
                <span className="truncate text-[0.95rem] text-ink">{row.label}</span>
                <span className="chip shrink-0 bg-cream-deep text-ink-faint">{row.count}</span>
              </dt>
              <dd className="shrink-0 text-sm text-ink-soft">
                {row.nearestM === null
                  ? 'none'
                  : showWalkTimes
                    ? `${formatDistance(row.nearestM)} · ${walkMinutes(row.nearestM)} min`
                    : formatDistance(row.nearestM)}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-7 text-sm leading-relaxed text-ink-soft">
          Nothing to score inside this radius. That is itself the finding.
        </p>
      )}
    </div>
  )
}
