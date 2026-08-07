import type { ScentProfile } from '@/lib/types'

const STRENGTH = ['Strongest', 'Underneath', 'Faint', 'Barely there']

export function ScentPanel({ scent }: { scent: ScentProfile }) {
  return (
    <div className="slab px-6 py-6">
      <p className="font-display text-2xl font-extrabold leading-snug text-ink">{scent.summary}</p>

      {scent.notes.length > 0 ? (
        <ul className="mt-6 space-y-4">
          {scent.notes.map((note, index) => (
            <li key={note.key}>
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    aria-hidden
                    className="inline-block h-4 w-4 shrink-0 rounded-full border-2 border-ink"
                    style={{ backgroundColor: note.color }}
                  />
                  <span className="truncate font-display text-lg font-extrabold text-ink">
                    {note.label}
                  </span>
                  <span className="tag shrink-0 bg-cream-deep text-ink">
                    {STRENGTH[index] ?? 'Trace'}
                  </span>
                </span>
                <span className="shrink-0 font-display text-lg font-extrabold text-ink">
                  {note.share}%
                </span>
              </div>

              <div className="mt-2 h-3.5 w-full overflow-hidden rounded-pill border-[3px] border-ink bg-cream-deep">
                <div
                  className="fill h-full"
                  style={{ width: `${Math.max(note.share, 3)}%`, backgroundColor: note.color }}
                />
              </div>

              <p className="mt-1.5 text-sm text-ink-faint">{note.detail}</p>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-6 leading-relaxed text-ink-soft">
        Built from the same map features as the walking score, but inside a half-mile radius, since
        smell does not carry a mile. Sources are weighted by how strongly they actually carry. A
        landfill outweighs a florist several times over.
      </p>
    </div>
  )
}
