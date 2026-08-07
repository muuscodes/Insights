import { Bird, Building2, Ruler, Sparkles } from 'lucide-react'

import { AddressSearch } from '@/components/AddressSearch'
import { SearchHistory } from '@/components/SearchHistory'

/*
  Two gradients over the artwork. The vertical pass fades the section into the
  cream background so the hero does not end on a hard seam; the horizontal pass
  darkens the left third, where the headline sits and where the artwork happens
  to be busiest.

  The source PNGs were 10.9 MB and 9.2 MB. They ship here as AVIF with a WebP
  fallback at 348 KB and 397 KB, art directed so portrait screens get the
  portrait crop rather than a centre-cropped landscape one.
*/
const heroScrim = {
  backgroundImage: [
    'linear-gradient(to bottom, rgba(8,8,8,0.45) 0%, rgba(8,8,8,0.35) 40%, rgba(255,246,229,0.04) 86%, rgba(255,246,229,1) 100%)',
    'linear-gradient(to right, rgba(8,8,8,0.88) 0%, rgba(8,8,8,0.74) 30%, rgba(8,8,8,0.32) 62%, rgba(8,8,8,0) 88%)',
  ].join(', '),
}

const STEPS = [
  {
    icon: Sparkles,
    title: 'Only what counts',
    body: 'Every mapped place within a mile, minus the noise. Benches, bins and bike racks get thrown out, and one park counts once no matter how many pieces it is drawn in.',
    color: 'bg-berry shadow-[0_5px_0_var(--color-berry-deep)]',
  },
  {
    icon: Ruler,
    title: 'Closer is better',
    body: 'Anything within a quarter mile earns full marks, then credit slides down to zero at the edge of the circle.',
    color: 'bg-sea shadow-[0_5px_0_var(--color-sea-deep)]',
  },
  {
    icon: Building2,
    title: 'Variety wins',
    body: 'The second grocery store is worth half the first, the third a quarter. Ten kinds of place beat three hundred restaurants.',
    color: 'bg-lime shadow-[0_5px_0_var(--color-lime-deep)]',
  },
]

const SOURCES = [
  { label: 'OpenStreetMap, for everything nearby', color: 'bg-lime' },
  { label: 'US Census Bureau, for who lives there', color: 'bg-sea' },
  { label: 'GBIF, for the birds', color: 'bg-sun' },
]

export default function InfoHome() {
  return (
    <main>
      {/*
        No `overflow-hidden` here on purpose: it clipped the address suggestions,
        which have to be free to hang past the bottom of the hero. The image and
        scrim are both `absolute inset-0`, so they are already bounded without
        it. `z-30` keeps the whole hero, and therefore the open dropdown, above
        the section that follows.
      */}
      <section className="relative z-30 flex min-h-[88vh] flex-col justify-end bg-[#0a0a0a] px-6 pt-24 pb-28 sm:px-10">
        <picture>
          <source media="(max-width: 640px)" type="image/avif" srcSet="/info-hero-mobile.avif" />
          <source media="(max-width: 640px)" type="image/webp" srcSet="/info-hero-mobile.webp" />
          <source type="image/avif" srcSet="/info-hero-desktop.avif" />
          <img
            src="/info-hero-desktop.webp"
            alt=""
            aria-hidden
            fetchPriority="high"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </picture>

        <div aria-hidden style={heroScrim} className="absolute inset-0" />

        <div className="relative mx-auto w-full max-w-5xl">
          <p className="pop rounded-pill border-ink bg-sun font-display text-ink inline-flex items-center gap-2 border-[3px] px-4 py-1.5 font-extrabold shadow-[0_4px_0_var(--color-ink)]">
            <Building2 size={17} strokeWidth={2.75} aria-hidden />
            Address Insights
          </p>

          <h1
            className="pop text-cream mt-6 max-w-3xl text-[clamp(2.75rem,8.5vw,6rem)] leading-[0.95]"
            style={{ animationDelay: '70ms' }}
          >
            What is it actually
            <br />
            like to live here?
          </h1>

          <p
            className="pop mt-6 max-w-xl text-lg leading-relaxed text-white"
            style={{ animationDelay: '140ms' }}
          >
            Type in any US street address. We will tell you how walkable it is, who lives nearby,
            what birds hang around, and yes, what the block probably smells like.
          </p>

          <div className="pop mt-9 max-w-2xl" style={{ animationDelay: '210ms' }}>
            <AddressSearch autoFocus />
          </div>
        </div>
      </section>

      <section className="relative z-0 mx-auto w-full max-w-5xl px-6 py-20 sm:px-10">
        <div className="grid gap-14 md:grid-cols-2">
          <div>
            <h2 className="text-ink text-4xl">How the scores work</h2>
            <p className="text-ink-soft mt-2">Three simple rules, no black box.</p>

            <div className="mt-7 space-y-4">
              {STEPS.map((step) => (
                <article key={step.title} className="slab flex gap-4 px-5 py-5">
                  <span
                    className={`border-ink text-ink grid h-12 w-12 shrink-0 place-items-center rounded-2xl border-[3px] ${step.color}`}
                  >
                    <step.icon size={22} strokeWidth={2.75} aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-ink text-2xl">{step.title}</h3>
                    <p className="text-ink-soft mt-1 leading-relaxed">{step.body}</p>
                  </div>
                </article>
              ))}
            </div>

            <p className="text-ink-soft mt-6 leading-relaxed">
              These are deliberately simple heuristics, not official indices. The reasoning is shown
              on every result so you can judge the number for yourself.
            </p>
          </div>

          <aside>
            <h2 className="text-ink text-4xl">Recent looks</h2>
            <p className="text-ink-soft mt-2">Saved on this device only.</p>
            <div className="mt-7">
              <SearchHistory />
            </div>

            <h2 className="text-ink mt-12 text-4xl">Where it comes from</h2>
            <ul className="mt-6 space-y-3">
              {SOURCES.map((source) => (
                <li key={source.label} className="slab flex items-center gap-3 px-4 py-3">
                  <span
                    aria-hidden
                    className={`border-ink h-5 w-5 shrink-0 rounded-lg border-[3px] ${source.color}`}
                  />
                  <span className="text-ink-soft">{source.label}</span>
                </li>
              ))}
            </ul>

            <p className="text-ink-faint mt-6 flex items-start gap-2 text-sm">
              <Bird size={16} strokeWidth={2.75} className="mt-0.5 shrink-0" aria-hidden />
              All real data, all free, one API key.
            </p>
          </aside>
        </div>
      </section>
    </main>
  )
}
