import type { ScentProfile } from '@/lib/types'

const STRENGTH = ['Strongest', 'Underneath', 'Faint', 'Barely there']

export function ScentPanel({ scent }: { scent: ScentProfile }) {
  return (
    <div className="card px-6 py-7">
      <p className="font-display text-2xl font-semibold leading-snug text-ink">{scent.summary}</p>

      {scent.notes.length > 0 ? (
        <ul className="mt-7 space-y-5">
          {scent.notes.map((note, index) => (
            <li key={note.key}>
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    aria-hidden
                    className="inline-block h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: note.color }}
                  />
                  <span className="truncate font-medium text-ink">{note.label}</span>
                  <span className="chip shrink-0 bg-cream-deep text-ink-faint">
                    {STRENGTH[index] ?? 'Trace'}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium text-ink-soft">{note.share}%</span>
              </div>

              <div className="mt-2 h-2 w-full overflow-hidden rounded-pill bg-cream-deep">
                <div
                  className="sweep h-full rounded-pill"
                  style={{ width: `${Math.max(note.share, 2)}%`, backgroundColor: note.color }}
                />
              </div>

              <p className="mt-1.5 text-xs text-ink-faint">{note.detail}</p>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-7 border-t border-edge pt-5 text-sm leading-relaxed text-ink-soft">
        Built from the same map features as the walking score, but inside a half-mile radius, since
        smell does not carry a mile. Sources are weighted by how strongly they actually carry. A
        landfill outweighs a florist several times over.
      </p>
    </div>
  )
}
