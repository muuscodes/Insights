const STEPS = [
  'Finding the address',
  'Counting what is nearby',
  'Reading the census',
  'Checking who else lives here',
]

/**
 * Suspense fallback for the report body. Deliberately rendered from inside the
 * page rather than a route-level `loading.tsx`: that would wrap the whole
 * segment in a Suspense boundary and flush a 200 before the coordinates had
 * even been validated, so a malformed URL could never return a real 404.
 */
export function InsightsSkeleton() {
  return (
    <main className="mx-auto flex min-h-[80vh] w-full max-w-6xl flex-col items-center justify-center px-6 py-20">
      {/* A pin dropping onto the map, with ripples going out from where it lands. */}
      <div className="relative grid h-40 w-40 place-items-center">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            aria-hidden
            className="ripple absolute h-36 w-36 rounded-full border-2 border-berry"
            style={{ animationDelay: `${index * 0.8}s` }}
          />
        ))}

        <span aria-hidden className="pin-drop pin-bob relative">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z"
              fill="#e05a47"
              stroke="#e05a47"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="10" r="2.6" fill="#fdf9f3" />
          </svg>
        </span>

        <span
          aria-hidden
          className="absolute bottom-3 h-2 w-10 rounded-pill bg-ink/10 blur-[2px]"
        />
      </div>

      <h1 className="mt-4 text-center font-display text-3xl font-semibold text-ink">
        Surveying the block
      </h1>
      <p className="mt-2 max-w-md text-center text-sm leading-relaxed text-ink-soft">
        Counting every mapped amenity within a mile, then going wider for anything the first pass
        came up short on. First look at an address takes a few seconds. After that it is instant.
      </p>

      <ul className="mt-8 flex flex-wrap items-center justify-center gap-2">
        {STEPS.map((step, index) => (
          <li
            key={step}
            className="chip shimmer rounded-pill px-3.5 py-2 text-ink-soft"
            style={{ animationDelay: `${index * 0.22}s` }}
          >
            {step}
          </li>
        ))}
      </ul>
    </main>
  )
}
