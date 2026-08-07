import { Bird, Building2, Sparkles, Wind } from 'lucide-react'

import { AddressSearch } from '@/components/AddressSearch'
import { SearchHistory } from '@/components/SearchHistory'

/*
  Two gradients over the artwork, not one. The vertical pass fades the section
  into the cream background so the hero does not end on a hard seam; the
  horizontal pass darkens the left third, where the headline sits and where the
  artwork happens to be busiest.

  The source PNGs were 10.9 MB and 9.2 MB. They ship here as AVIF with a WebP
  fallback at 348 KB and 397 KB, art directed so portrait screens get the
  portrait crop rather than a centre-cropped landscape one.
*/
const heroScrim = {
  backgroundImage: [
    'linear-gradient(to bottom, rgba(8,8,8,0.45) 0%, rgba(8,8,8,0.35) 40%, rgba(253,249,243,0.04) 86%, rgba(253,249,243,1) 100%)',
    'linear-gradient(to right, rgba(8,8,8,0.88) 0%, rgba(8,8,8,0.74) 30%, rgba(8,8,8,0.32) 62%, rgba(8,8,8,0) 88%)',
  ].join(', '),
}

const STEPS = [
  {
    icon: Sparkles,
    title: 'Only what counts',
    body: 'Every mapped feature within a mile, minus the noise. Benches, bins and bike racks are thrown out. A grocery store should not score the same as a park bench.',
    chip: 'bg-berry-wash text-berry',
  },
  {
    icon: Building2,
    title: 'Closer is better',
    body: 'Anything within a quarter mile earns full marks, then credit slides down to zero at the edge of the circle.',
    chip: 'bg-sky-wash text-sky',
  },
  {
    icon: Wind,
    title: 'Variety wins',
    body: 'The second grocery store is worth half the first, the third a quarter. Ten kinds of place beat three hundred restaurants.',
    chip: 'bg-leaf-wash text-leaf',
  },
]

export default function InfoHome() {
  return (
    <main>
      <section className="relative flex min-h-[92vh] flex-col justify-end overflow-hidden bg-[#0a0a0a] px-6 pb-20 pt-24 sm:px-10">
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
          <p className="rise inline-flex items-center gap-2 rounded-pill bg-white/12 px-4 py-1.5 text-sm text-cream backdrop-blur-sm">
            <Building2 size={15} aria-hidden />
            Address Insights
          </p>

          <h1
            className="rise mt-6 max-w-3xl font-display text-[clamp(2.75rem,8vw,5.5rem)] font-semibold leading-[0.98] text-cream"
            style={{ animationDelay: '80ms' }}
          >
            What is it actually
            <br />
            like to live here?
          </h1>

          <p
            className="rise mt-6 max-w-xl text-lg leading-relaxed text-cream/85"
            style={{ animationDelay: '160ms' }}
          >
            Type in any US street address. We will tell you how walkable it is, who lives nearby,
            what birds hang around, and yes, what the block probably smells like.
          </p>

          <div className="rise mt-9 max-w-2xl" style={{ animationDelay: '240ms' }}>
            <AddressSearch autoFocus />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-6 py-20 sm:px-10">
        <div className="grid gap-14 md:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="font-display text-3xl font-semibold text-ink">How the scores work</h2>
            <p className="mt-2 text-ink-soft">Three simple rules, no black box.</p>

            <div className="mt-7 space-y-4">
              {STEPS.map((step) => (
                <article key={step.title} className="card flex gap-4 px-5 py-5">
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${step.chip}`}>
                    <step.icon size={20} aria-hidden />
                  </span>
                  <div>
                    <h3 className="font-display text-xl font-semibold text-ink">{step.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{step.body}</p>
                  </div>
                </article>
              ))}
            </div>

            <p className="mt-6 text-sm leading-relaxed text-ink-soft">
              These are deliberately simple heuristics, not official indices. The reasoning is shown
              on every result so you can judge the number for yourself.
            </p>
          </div>

          <aside>
            <h2 className="font-display text-3xl font-semibold text-ink">Recent looks</h2>
            <p className="mt-2 text-ink-soft">Saved on this device only.</p>
            <div className="mt-7">
              <SearchHistory />
            </div>

            <h2 className="mt-12 font-display text-3xl font-semibold text-ink">Where it comes from</h2>
            <ul className="mt-6 space-y-3">
              <li className="card flex items-center gap-3 px-4 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-leaf-wash text-leaf">
                  <Building2 size={16} aria-hidden />
                </span>
                <span className="text-sm text-ink-soft">OpenStreetMap, for everything nearby</span>
              </li>
              <li className="card flex items-center gap-3 px-4 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-wash text-sky">
                  <Sparkles size={16} aria-hidden />
                </span>
                <span className="text-sm text-ink-soft">US Census Bureau, for who lives there</span>
              </li>
              <li className="card flex items-center gap-3 px-4 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-honey-wash text-honey">
                  <Bird size={16} aria-hidden />
                </span>
                <span className="text-sm text-ink-soft">GBIF, for the birds</span>
              </li>
            </ul>
          </aside>
        </div>
      </section>
    </main>
  )
}
