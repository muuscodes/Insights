import type { ScentProfile } from '@/lib/types'

const STRENGTH = ['Strongest', 'Underneath', 'Faint', 'Barely there']

export function ScentPanel({ scent }: { scent: ScentProfile }) {
  return (
    <div className="slab px-6 py-6">
      <p className="font-display text-ink text-2xl leading-snug font-extrabold">{scent.summary}</p>

      {scent.notes.length > 0 ? (
        <ul className="mt-6 space-y-4">
          {scent.notes.map((note, index) => (
            <li key={note.key}>
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    aria-hidden
                    className="border-ink inline-block h-4 w-4 shrink-0 rounded-full border-2"
                    style={{ backgroundColor: note.color }}
                  />
                  <span className="font-display text-ink truncate text-lg font-extrabold">
                    {note.label}
                  </span>
                  <span className="tag bg-cream-deep text-ink shrink-0">
                    {STRENGTH[index] ?? 'Trace'}
                  </span>
                </span>
                <span className="font-display text-ink shrink-0 text-lg font-extrabold">
                  {note.share}%
                </span>
              </div>

              <div className="rounded-pill border-ink bg-cream-deep mt-2 h-3.5 w-full overflow-hidden border-[3px]">
                <div
                  className="fill h-full"
                  style={{ width: `${Math.max(note.share, 3)}%`, backgroundColor: note.color }}
                />
              </div>

              <p className="text-ink-faint mt-1.5 text-sm">{note.detail}</p>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="text-ink-soft mt-6 leading-relaxed">
        Built from the same map features as the walking score, but inside a half-mile radius, since
        smell does not carry a mile. Sources are weighted by how strongly they actually carry. A
        landfill outweighs a florist several times over.
      </p>
    </div>
  )
}
