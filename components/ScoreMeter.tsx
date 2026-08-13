import { Car, Footprints } from 'lucide-react'

import { formatDistance, walkMinutes } from '@/lib/geo'
import { scoreBand, type ScoreTone } from '@/lib/scoring/score'
import type { ScoreResult } from '@/lib/types'

/**
 * Colour the whole score block by how good the score actually is. Driven by the
 * same band table as the wording, so the two cannot disagree.
 */
const TONE: Record<ScoreTone, { block: string; bar: string }> = {
  good: { block: 'bg-lime shadow-[0_6px_0_var(--color-lime-deep)]', bar: 'bg-lime' },
  mixed: { block: 'bg-sun shadow-[0_6px_0_var(--color-sun-deep)]', bar: 'bg-sun' },
  poor: { block: 'bg-tang shadow-[0_6px_0_var(--color-tang-deep)]', bar: 'bg-tang' },
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
  const tone = TONE[scoreBand(result.score).tone]
  const Icon = kind === 'Walking' ? Footprints : Car
  const top = result.breakdown.filter((row) => row.count > 0).slice(0, 6)

  return (
    <div className="slab px-6 py-6">
      <div className="flex items-center justify-between gap-3">
        <span className="font-display text-ink flex items-center gap-2 text-xl font-extrabold">
          <Icon size={20} strokeWidth={2.75} aria-hidden />
          {kind}
        </span>
        <span className="tag bg-cream-deep text-ink">{result.radiusMi} mi</span>
      </div>

      {/* The score as a pressable-looking block, not a thin bar. */}
      <div className="mt-5 flex items-stretch gap-4">
        <div
          className={`pop border-ink grid min-w-[7rem] place-items-center rounded-2xl border-[3px] px-5 py-4 ${tone.block}`}
        >
          <span className="numeral text-ink text-[4.25rem]">{result.score}</span>
        </div>

        <div className="flex flex-col justify-center">
          <p className="font-display text-ink text-2xl leading-tight font-extrabold">
            {result.label}
          </p>
          <p className="text-ink-soft mt-0.5 text-sm">out of 100</p>
        </div>
      </div>

      <div className="rounded-pill border-ink bg-cream-deep mt-5 h-4 w-full overflow-hidden border-[3px]">
        <div
          className={`fill h-full ${tone.bar}`}
          style={{ width: `${Math.max(result.score, 3)}%` }}
          // progressbar rather than meter: screen reader support for `meter` is
          // patchy, and the two convey the same thing here.
          role="progressbar"
          aria-valuenow={result.score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${result.score} out of 100, ${result.label}`}
          aria-label={`${kind} score`}
        />
      </div>

      {top.length > 0 ? (
        <dl className="mt-6 space-y-2">
          {top.map((row) => (
            <div
              key={row.key}
              className="border-ink bg-cream flex items-center justify-between gap-3 rounded-xl border-[2.5px] px-3 py-2"
            >
              <dt className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden
                  className="border-ink inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2"
                  style={{ backgroundColor: row.color }}
                />
                <span className="text-ink truncate text-[0.95rem]">{row.label}</span>
                <span className="font-display text-ink-faint shrink-0 text-sm font-extrabold">
                  {row.count}
                </span>
              </dt>
              <dd className="font-display text-ink-soft shrink-0 text-sm font-bold">
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
        <p className="text-ink-soft mt-6 leading-relaxed">
          Nothing to score inside this radius. That is itself the finding.
        </p>
      )}
    </div>
  )
}
