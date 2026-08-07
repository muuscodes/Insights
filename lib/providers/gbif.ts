import 'server-only'

import { WALK_RADIUS_M, type LatLng } from '../geo'
import { fetchJson } from '../http'
import type { Bird } from '../types'

/**
 * GBIF occurrence records, filtered to birds.
 *
 * Keyless, unlike eBird which returns 403 without a token. A live probe at a
 * San Francisco address returned 34,369 bird records inside the 1-mile radius,
 * so there is real signal here even in a dense city.
 */

const BASE = 'https://api.gbif.org/v1'

/** GBIF taxon key for class Aves. */
const AVES_TAXON_KEY = 212

const CACHE_SECONDS = 60 * 60 * 24 * 7

const SPECIES_COUNT = 6

/** How far back to look. Old museum specimens say little about a block today. */
const YEARS_BACK = 10

interface FacetResponse {
  facets?: Array<{
    field?: string
    counts?: Array<{ name?: string; count?: number }>
  }>
}

interface SpeciesResponse {
  canonicalName?: string
  scientificName?: string
  vernacularName?: string
}

interface VernacularNamesResponse {
  results?: Array<{ vernacularName?: string; language?: string }>
}

/**
 * Not every species record carries a top-level `vernacularName`, so fall back
 * to the dedicated endpoint. Without this the panel shows binomials, and
 * "Calypte anna" means far less to a reader than "Anna's Hummingbird".
 *
 * The list is contributed by many sources and contains regional aliases, so
 * taking the first English entry is a trap: it yields "Hollywood Finch" for the
 * House Finch and "Bicolored Blackbird" for the Red-winged Blackbird. Counting
 * and taking the most frequently submitted name lands on the one people
 * actually use.
 */
async function commonNameFor(key: number): Promise<string | null> {
  try {
    const data = await fetchJson<VernacularNamesResponse>(
      `${BASE}/species/${key}/vernacularNames?limit=100`,
      { revalidate: CACHE_SECONDS, timeoutMs: 8000 },
    )

    const tally = new Map<string, number>()
    for (const entry of data.results ?? []) {
      if (entry.language !== 'eng' || !entry.vernacularName) continue
      const name = entry.vernacularName.trim()
      if (name.length === 0) continue
      tally.set(name, (tally.get(name) ?? 0) + 1)
    }

    if (tally.size === 0) return null

    // Ties break toward the shorter name, which is reliably the plain one.
    return [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0]![0]
  } catch {
    return null
  }
}

/** Title-case, since GBIF contributors submit a mix of casings. */
function tidyCommonName(name: string): string {
  return name
    .split(' ')
    .map((word) => (word.length > 0 ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(' ')
}

export async function fetchBirds(center: LatLng): Promise<Bird[]> {
  const currentYear = new Date().getUTCFullYear()
  const radiusKm = (WALK_RADIUS_M / 1000).toFixed(2)

  // geoDistance must be "lat,lng,distance"; passing the parts separately is a
  // 400 from GBIF. limit=0 keeps the response to facets only, which is far
  // cheaper than pulling occurrence rows we would immediately discard.
  const url =
    `${BASE}/occurrence/search` +
    `?taxonKey=${AVES_TAXON_KEY}` +
    `&geoDistance=${center.lat},${center.lng},${radiusKm}km` +
    `&year=${currentYear - YEARS_BACK},${currentYear}` +
    `&hasCoordinate=true` +
    `&occurrenceStatus=PRESENT` +
    `&limit=0&facet=speciesKey&facetLimit=${SPECIES_COUNT}`

  const data = await fetchJson<FacetResponse>(url, { revalidate: CACHE_SECONDS, timeoutMs: 10_000 })

  const counts = data.facets?.find((f) => f.field === 'SPECIES_KEY')?.counts ?? []

  const candidates = counts
    .map((c) => ({ key: Number(c.name), observations: c.count ?? 0 }))
    .filter((c) => Number.isInteger(c.key) && c.key > 0 && c.observations > 0)

  if (candidates.length === 0) return []

  // GBIF facets return species keys, not names. Resolve them in parallel; a
  // single failed lookup falls back to the key's own label rather than
  // dropping the species.
  const resolved = await Promise.all(
    candidates.map(async ({ key, observations }): Promise<Bird | null> => {
      try {
        const species = await fetchJson<SpeciesResponse>(`${BASE}/species/${key}`, {
          revalidate: CACHE_SECONDS,
          timeoutMs: 8000,
        })

        const scientificName = species.canonicalName ?? species.scientificName ?? 'Unknown species'
        const common = species.vernacularName ?? (await commonNameFor(key))

        return {
          speciesKey: key,
          commonName: common ? tidyCommonName(common) : scientificName,
          scientificName,
          observations,
        }
      } catch {
        return null
      }
    }),
  )

  return resolved.filter((bird): bird is Bird => bird !== null)
}
