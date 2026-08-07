import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export type Accent = 'berry' | 'lime' | 'sea' | 'grape' | 'sun' | 'tang'

/**
 * Full class strings rather than interpolation, because Tailwind extracts
 * classes statically and would never see `bg-${accent}`.
 */
const ACCENT: Record<Accent, string> = {
  berry: 'bg-berry shadow-[0_5px_0_var(--color-berry-deep)]',
  lime: 'bg-lime shadow-[0_5px_0_var(--color-lime-deep)]',
  sea: 'bg-sea shadow-[0_5px_0_var(--color-sea-deep)]',
  grape: 'bg-grape shadow-[0_5px_0_var(--color-grape-deep)]',
  sun: 'bg-sun shadow-[0_5px_0_var(--color-sun-deep)]',
  tang: 'bg-tang shadow-[0_5px_0_var(--color-tang-deep)]',
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
  return (
    <section className={className}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h2 className="flex items-center gap-3.5">
          <span
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl border-[3px] border-ink text-ink ${ACCENT[accent]}`}
          >
            <Icon size={22} strokeWidth={2.75} aria-hidden />
          </span>
          <span className="text-3xl text-ink sm:text-[2rem]">{title}</span>
        </h2>

        {note ? <span className="tag bg-card text-ink">{note}</span> : null}
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
    <div className="slab bg-cream-deep px-6 py-7">
      <p className="font-display text-xl font-extrabold text-ink">This part did not load</p>
      <p className="mt-1.5 leading-relaxed text-ink-soft">{reason}</p>
    </div>
  )
}
