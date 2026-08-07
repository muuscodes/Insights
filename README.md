# Address Insights

Type a US street address, get a report on the neighborhood: how walkable it is,
how drivable it is, how built up it is, who lives there, what birds are around,
and what the block probably smells like.

**Live:** _(filled in after deploy)_

Built for the RentEngine interview challenge.

---

## What it does

| Feature | How |
| --- | --- |
| **Walking Score** | Weighted amenity count inside 1 mile, with distance decay and diminishing returns |
| **Driving Score** | Same engine at 5 miles, reweighted toward destinations worth a car trip |
| **Urban / Suburban Index** | Amenity density blended with real census tract population density |
| **Search history** | Last 8 lookups in `localStorage`, never sent to the server |
| **Map** | MapLibre + OpenFreeMap vector tiles, amenities colored by category inside the 1-mile circle |
| **Shareable page** | Coordinates live in the URL, so a link renders identically for anyone. Shortened via TinyURL on copy |
| **Census demographics** | ACS 5-year population, age, income, home value, education for the tract |
| **Scent profile** | Weighted smell sources within a half mile, ranked as scent notes |
| **Birds** | Most-recorded species within a mile over the last ten years |

## Data sources

All real, all free, one key.

| Layer | Source | Key needed |
| --- | --- | --- |
| Address autocomplete | Photon (Komoot) | no |
| Address to coordinates | US Census Geocoder | no |
| Coordinates to census tract + land area | US Census Geographies | no |
| Demographics | US Census ACS 5-year (2023) | **yes, free** |
| Amenities | OpenStreetMap via Overpass | no |
| Map tiles | OpenFreeMap | no |
| Birds | GBIF occurrence records | no |
| Link shortening | TinyURL legacy endpoint | no |

The Census pieces are the same public data behind
[neighborhood-insights.com](https://neighborhood-insights.com), which is where
the brief pointed.

## Running it

```bash
pnpm install
cp .env.example .env.local     # add a free Census key
pnpm dev                       # http://localhost:3000
```

Get a Census key instantly at <https://api.census.gov/data/key_signup.html>.
Without it everything still works; the demographics panel just reports itself
unavailable and the Urban Index falls back to amenity density alone.

```bash
pnpm test        # 153 unit + route tests
pnpm typecheck
pnpm lint
pnpm build
```

---

## Approach

### Scoring

The brief said to keep the math simple and explain the reasoning, so the whole
scoring engine is pure functions in `lib/scoring/` with no I/O.

**The first real problem was noise.** A 1-mile Overpass query around the White
House returns 3,106 tagged features. The single most common one is `bench`, at
977. Then waste baskets, then bicycle parking. Counting features in a radius
would score a park bench like a grocery store, so scoring runs off a
**weighted category whitelist** (`lib/scoring/taxonomy.ts`), and anything
unrecognized contributes nothing.

Each score then applies:

1. **Distance decay.** Full credit within a quarter of the radius, sliding
   linearly to zero at the edge. Linear rather than exponential because it is
   trivial to explain and to test, and the brief explicitly preferred that over
   false precision.
2. **Diminishing returns.** Within a category the nearest counts fully, the
   second half, the third a quarter. In San Francisco there really are 300
   restaurants inside a mile, and the 300th should not move the number.
3. **Breadth over volume.** Categories are combined by weight and normalized
   against the theoretical maximum, so ten kinds of destination beat one dense
   category.

Driving reuses the same engine at 5 miles with different weights: groceries,
hospitals, big-box retail and schools weight up, cafes drop to 0.3, because
nobody drives five miles for a coffee.

### Urban / Suburban Index

Two measurements rather than a vibe:

- Whitelisted amenities per square mile inside the 1-mile circle.
- Tract residents per square mile, from ACS population divided by `AREALAND`,
  which the Census geographies response returns directly.

Both are mapped on a log scale and averaged. Two inputs, because either alone
misreads a place: a downtown core has huge amenity density and few residents, a
dense bedroom suburb is the reverse. The UI shows the index, the label, and both
underlying numbers, so the reasoning is visible.

Sanity check against real addresses:

| Place | Walk | Urban index | Residents / sq mi |
| --- | --- | --- | --- |
| Mission District, San Francisco | 100 | 96, Urban Core | 21,305 |
| Naperville, Illinois | 84 | 52, Urban | 3,121 |
| Rural Nebraska | 0 | 0, Rural | 2 |

### Making Overpass usable

This was most of the engineering. Three problems, all found by measuring.

**A 5-mile query does not survive a dense city.** Measured around Times Square:
31,785 elements, 10.9 MB, 36 seconds. That would blow the serverless timeout. So
the driving query is **adaptive**: the 1-mile pass runs always, then a wider pass
runs *only for categories the first pass left short*. This is self-balancing.
Downtown saturates nearly every category inside a mile, so the wide pass asks for
little or nothing. A rural address triggers a wide pass that returns almost
nothing, because the area really is empty. Dense *and* wide is the one case that
cannot happen.

**Cost tracks clause count, not payload.** Twelve clauses carrying value regexes
timed out on two public instances. Rewriting to eight clauses that fetch the big
tags unfiltered and narrow them in code returned 3,473 features in 7.1 seconds.
Value filters survive only where the bare tag would drag in the whole map
(`highway`, `landuse`, `natural`).

**Public instances rate limit and hang.** Requests walk a mirror list with a
25 second timeout, deliberately shorter than it could be: one mirror hanging
until a 45 second timeout turned a page into a 106 second wait. Results cache
for 24 hours.

Net effect, measured:

| | Before | After |
| --- | --- | --- |
| Cold, dense urban | 102 s | 4.1 s |
| Cold, suburban | 106 s | 15.6 s |
| Warm (cached) | | 0.1 s |

**One bug worth calling out.** The original mirror list included
`overpass.osm.ch`. That is the Swiss instance and only carries Switzerland, so it
answers a San Francisco query with `200 OK` and zero elements. A failover that
trusts a status code takes that as success, and the Mission District scored 0 out
of 100. It is now removed, an empty response is treated as a reason to try the
next mirror, and there is a test asserting it never comes back.

### Security

- **Every third-party call is server side.** Provider modules import
  `server-only`, so no key and no provider hostname reaches the browser.
- **`CENSUS_API_KEY` is server only**, never `NEXT_PUBLIC_`. `.env.local` is
  gitignored and no credential is committed.
- **Zod validates every input** at the route boundary. This caught a real bug:
  `Number(null)` and `Number('')` are both `0`, so coercing before validating
  read a parameterless request as the coordinates of the Gulf of Guinea and
  cheerfully built a report for the open ocean. `coordParamsSchema` now
  validates the raw string first.
- **No Overpass QL injection.** Queries are built from a fixed template with
  only validated numbers interpolated, and tag tokens are re-checked against a
  safe-character pattern.
- **The shortener is origin locked.** It accepts a path, never a URL, and rebuilds
  the absolute URL from this deployment's own origin. Accepting a caller-supplied
  URL would turn it into an open URL shortener pointed at anything. Tested,
  including the `//evil.example.com` protocol-relative trick.
- **Per-IP rate limiting** on all three API routes. Honest caveat: this is
  in-process, so on serverless each instance counts separately. It is enough to
  stop one client hammering the free upstreams. Upstash is the drop-in upgrade.
- **Timeouts and `AbortController`** on every outbound request.
- **Security headers** in `next.config.ts`: CSP, `X-Frame-Options`,
  `Referrer-Policy`, `X-Content-Type-Options`, HSTS.
- **localStorage is treated as untrusted** and schema-validated on read, so a
  tampered entry cannot inject anything into the UI.

### Resilience

Providers are independent. Each panel is a discriminated union carrying either
data or a reason, assembled with `Promise.allSettled`, so one dead provider
costs you one panel rather than the page. Failures are logged server side, since
a silently missing panel is otherwise invisible.

---

## Design decisions and assumptions

- **Shareable pages are stateless.** Coordinates in the path fully determine
  every number, so there is no database, no session, and no link that can
  expire. TinyURL is applied at copy time only, because a raw coordinate URL is
  ugly to paste into a text message.
- **US only, for now.** Every downstream insight (tracts, ACS) is US-only, so
  offering a Paris address would produce a half-broken page. Non-US matches are
  detected and the UI says the feature is coming, rather than implying the
  address does not exist.
- **1 mile walking, 5 miles driving.** 1 mile was specified; 5 miles is roughly
  a 10 to 15 minute drive and satisfies the brief's "greater radius".
- **Scent uses a half-mile radius**, not a mile, because smell does not carry
  that far. Sources are weighted by how strongly they actually carry, so a
  landfill outweighs a florist several times over. It costs zero extra network
  calls: it re-reads the POIs already fetched for the walking score.
- **Bird common names take the most frequently submitted English name.** Taking
  the first one gives you "Hollywood Finch" instead of "House Finch", and
  "Bicolored Blackbird" instead of "Red-winged Blackbird".
- **Map POIs are sampled evenly by distance**, not taken nearest-first. Nearest
  500 packs the dots into a disc in the middle and makes the outer half of the
  circle look empty when it is not.
- **No route-level `loading.tsx`.** It wraps the whole segment in a Suspense
  boundary and flushes a `200` before the coordinates are validated, so a
  malformed URL could never return a real `404`. The skeleton lives inside the
  page, after validation.
- **Scores saturate at 100 in very dense places.** Both scores read 100 in the
  Mission. That is a real limitation of a bounded scale; the per-category
  breakdown is what carries the detail up there.
- **Coverage depends on OpenStreetMap volunteers**, which varies a lot between
  cities and rural areas. Stated on every report.

## Stack

Next.js 15 (App Router, RSC) · TypeScript strict · Tailwind v4 · MapLibre GL ·
Zod · Vitest · deployed on Vercel. No component library; the UI is hand built.

---

## What I built vs what AI generated

Being straight about this, since the brief asks.

**Claude (Opus 5) wrote essentially all of the code**, in an interactive session
where I directed the work. Every file here was AI-generated, then reviewed and
iterated on together.

**What I decided and drove:**

- The product: which features to build, and cutting the ones not worth the time.
  The scent profile and the birds were my idea.
- The data sources. I wanted the Census databases behind
  neighborhood-insights.com specifically, and the 1-mile calculation radius.
- The stack: Tailwind over MUI, and a keyless-first provider set so the whole
  thing runs on one free key.
- The design direction, including rejecting a first pass that came out too
  corporate and asking for something more relaxed.
- The hero artwork, which I generated separately.
- Route naming, TinyURL for sharing, the US-only messaging, and the loading
  animation.

**What the AI drove:**

- All implementation, including the scoring heuristics and their calibration.
- The measurement work behind the Overpass section above. The Times Square
  payload and the Swiss-mirror bug came out of benchmarking rather than guessing,
  which is the part I would not have thought to do by hand.
- The 153 tests, several of which caught real bugs. The Gulf of Guinea
  coordinate bug was found by a test, not by me.

I can walk through any decision in here and explain why it is the way it is.
