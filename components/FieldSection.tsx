import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export type Accent = 'berry' | 'leaf' | 'sky' | 'plum' | 'honey'

/**
 * Full class strings rather than interpolation, because Tailwind extracts
 * classes statically and would never see `bg-${accent}-wash`.
 */
const ACCENT: Record<Accent, { chip: string; icon: string }> = {
  berry: { chip: 'bg-berry-wash text-berry', icon: 'text-berry' },
  leaf: { chip: 'bg-leaf-wash text-leaf', icon: 'text-leaf' },
  sky: { chip: 'bg-sky-wash text-sky', icon: 'text-sky' },
  plum: { chip: 'bg-plum-wash text-plum', icon: 'text-plum' },
  honey: { chip: 'bg-honey-wash text-honey', icon: 'text-honey' },
}

export function FieldSection({
  title,
  icon: Icon,
  accent,
  note,
  children,
  className = '',
}: {
  title: string
  icon: LucideIcon
  accent: Accent
  note?: string
  children: ReactNode
  className?: string
}) {
  const tone = ACCENT[accent]

  return (
    <section className={className}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="flex items-center gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${tone.chip}`}>
            <Icon size={19} strokeWidth={2} aria-hidden />
          </span>
          <span className="font-display text-2xl font-semibold text-ink sm:text-[1.6rem]">{title}</span>
        </h2>

        {note ? <span className="chip bg-cream-deep text-ink-soft">{note}</span> : null}
      </div>

      <div className="mt-5">{children}</div>
    </section>
  )
}

/**
 * Shown in place of a panel whose provider failed. Says what is missing and
 * why, rather than leaving an empty box or collapsing the layout.
 */
export function Unavailable({ reason }: { reason: string }) {
  return (
    <div className="card px-6 py-7">
      <p className="text-base font-medium text-ink">This part did not load</p>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{reason}</p>
    </div>
  )
}
