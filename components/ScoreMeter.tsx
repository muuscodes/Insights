import { Car, Footprints } from 'lucide-react'

import { formatDistance, walkMinutes } from '@/lib/geo'
import type { ScoreResult } from '@/lib/types'

/** Colour the whole score block by how good the score actually is. */
function toneFor(score: number): { block: string; bar: string } {
  if (score >= 70) {
    return { block: 'bg-lime shadow-[0_6px_0_var(--color-lime-deep)]', bar: 'bg-lime' }
  }
  if (score >= 40) {
    return { block: 'bg-sun shadow-[0_6px_0_var(--color-sun-deep)]', bar: 'bg-sun' }
  }
  return { block: 'bg-tang shadow-[0_6px_0_var(--color-tang-deep)]', bar: 'bg-tang' }
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
    <div className="slab px-6 py-6">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-display text-xl font-extrabold text-ink">
          <Icon size={20} strokeWidth={2.75} aria-hidden />
          {kind}
        </span>
        <span className="tag bg-cream-deep text-ink">{result.radiusMi} mi</span>
      </div>

      {/* The score as a pressable-looking block, not a thin bar. */}
      <div className="mt-5 flex items-stretch gap-4">
        <div
          className={`pop grid min-w-[7rem] place-items-center rounded-2xl border-[3px] border-ink px-5 py-4 ${tone.block}`}
        >
          <span className="numeral text-[4.25rem] text-ink">{result.score}</span>
        </div>

        <div className="flex flex-col justify-center">
          <p className="font-display text-2xl font-extrabold leading-tight text-ink">
            {result.label}
          </p>
          <p className="mt-0.5 text-sm text-ink-soft">out of 100</p>
        </div>
      </div>

      <div className="mt-5 h-4 w-full overflow-hidden rounded-pill border-[3px] border-ink bg-cream-deep">
        <div
          className={`fill h-full ${tone.bar}`}
          style={{ width: `${Math.max(result.score, 3)}%` }}
          role="meter"
          aria-valuenow={result.score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${kind} score`}
        />
      </div>

      {top.length > 0 ? (
        <dl className="mt-6 space-y-2">
          {top.map((row) => (
            <div
              key={row.key}
              className="flex items-center justify-between gap-3 rounded-xl border-[2.5px] border-ink bg-cream px-3 py-2"
            >
              <dt className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden
                  className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 border-ink"
                  style={{ backgroundColor: row.color }}
                />
                <span className="truncate text-[0.95rem] text-ink">{row.label}</span>
                <span className="shrink-0 font-display text-sm font-extrabold text-ink-faint">
                  {row.count}
                </span>
              </dt>
              <dd className="shrink-0 font-display text-sm font-bold text-ink-soft">
                {row.nearestM === null
                  ? 'none'
                  : showWalkTimes
                    ? `${formatDistance(row.nearestM)} · ${walkMinutes(row.nearestM)}m`
                    : formatDistance(row.nearestM)}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-6 leading-relaxed text-ink-soft">
          Nothing to score inside this radius. That is itself the finding.
        </p>
      )}
    </div>
  )
}
