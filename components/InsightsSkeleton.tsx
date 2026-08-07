const STEPS = [
  { label: 'Finding the address', color: 'bg-sun' },
  { label: 'Counting what is nearby', color: 'bg-lime' },
  { label: 'Reading the census', color: 'bg-sea' },
  { label: 'Checking the birds', color: 'bg-berry' },
]

/**
 * Suspense fallback for the report body. Deliberately rendered from inside the
 * page rather than a route-level `loading.tsx`: that would wrap the whole
 * segment in a Suspense boundary and flush a 200 before the coordinates had
 * even been validated, so a malformed URL could never return a real 404.
 */
export function InsightsSkeleton() {
  return (
    <main className="mx-auto flex min-h-[85vh] w-full max-w-2xl flex-col items-center justify-center px-6 py-20">
      {/* A pin bouncing on the spot, with rings pushing out where it lands. */}
      <div className="relative grid h-44 w-44 place-items-center">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            aria-hidden
            className="ring absolute h-40 w-40 rounded-full border-[3px] border-ink"
            style={{ animationDelay: `${index * 0.63}s` }}
          />
        ))}

        <span aria-hidden className="absolute bottom-6 h-2.5 w-14 rounded-pill bg-ink squash" />

        <span aria-hidden className="pin-bounce relative">
          <svg width="60" height="60" viewBox="0 0 24 24" aria-hidden>
            <path
              d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z"
              fill="#ff5d8f"
              stroke="#241d18"
              strokeWidth="1.9"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="10" r="2.7" fill="#fff6e5" stroke="#241d18" strokeWidth="1.5" />
          </svg>
        </span>
      </div>

      <h1 className="mt-6 text-center text-4xl text-ink">Scouting the block</h1>
      <p className="mt-2 max-w-md text-center leading-relaxed text-ink-soft">
        Counting every mapped place within a mile, then casting wider for anything the first pass
        came up short on. The first look at an address takes a few seconds. After that it is
        instant.
      </p>

      <ul className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
        {STEPS.map((step, index) => (
          <li
            key={step.label}
            className={`blink rounded-pill border-[3px] border-ink px-4 py-1.5 font-display text-sm font-extrabold text-ink ${step.color}`}
            style={{ animationDelay: `${index * 0.28}s` }}
          >
            {step.label}
          </li>
        ))}
      </ul>
    </main>
  )
}
