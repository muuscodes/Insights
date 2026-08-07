import 'server-only'

import { fetchJson } from '../http'
import type { LatLng } from '../geo'

/**
 * Photon (Komoot) for address autocomplete and reverse lookup.
 *
 * The Census geocoder is exact-match only, so it cannot drive a type-ahead.
 * Photon handles the search box; the Census geocoder and tract lookup take over
 * once a specific place has been chosen.
 */

const BASE = 'https://photon.komoot.io'
const CACHE_SECONDS = 60 * 60 * 24 * 7

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] }
  properties?: {
    osm_id?: number
    osm_type?: string
    name?: string
    housenumber?: string
    street?: string
    city?: string
    district?: string
    county?: string
    state?: string
    postcode?: string
    countrycode?: string
  }
}

interface PhotonResponse {
  features?: PhotonFeature[]
}

export interface Suggestion {
  id: string
  /** Street line, e.g. "1600 Pennsylvania Avenue Northwest". */
  primary: string
  /** Locality line, e.g. "Washington, District of Columbia 20500". */
  secondary: string
  lat: number
  lng: number
}

function buildLines(properties: NonNullable<PhotonFeature['properties']>): {
  primary: string
  secondary: string
} | null {
  const { name, housenumber, street, city, district, county, state, postcode } = properties

  const streetLine = street ? [housenumber, street].filter(Boolean).join(' ') : null
  const primary = streetLine ?? name ?? null
  if (!primary) return null

  const locality = city ?? district ?? county ?? null
  const secondary = [locality, state, postcode]
    .filter(Boolean)
    .join(', ')
    .replace(/, (\d{5})$/, ' $1')

  return { primary, secondary }
}

export interface SuggestResult {
  suggestions: Suggestion[]
  /**
   * True when the query matched real places outside the US. Lets the UI explain
   * why a perfectly valid address returned nothing, instead of implying the
   * address does not exist.
   */
  sawNonUsMatches: boolean
}

/**
 * Address suggestions, restricted to the United States because every insight
 * downstream (census tracts, ACS demographics) is US-only. Offering a Paris
 * address that then fails to produce half the page would be worse than saying
 * up front that it is not supported yet.
 */
export async function suggestAddresses(query: string): Promise<SuggestResult> {
  const url = `${BASE}/api/?q=${encodeURIComponent(query)}&limit=12&lang=en`
  const data = await fetchJson<PhotonResponse>(url, { revalidate: CACHE_SECONDS, timeoutMs: 6000 })

  const suggestions: Suggestion[] = []
  const seen = new Set<string>()
  let sawNonUsMatches = false

  for (const feature of data.features ?? []) {
    const properties = feature.properties
    const coordinates = feature.geometry?.coordinates
    if (!properties || !coordinates) continue

    if (properties.countrycode !== 'US') {
      // Only count it if it is a real named place, not a stray unlabelled node.
      if (properties.street || properties.name || properties.city) sawNonUsMatches = true
      continue
    }

    const [lng, lat] = coordinates
    if (typeof lat !== 'number' || typeof lng !== 'number') continue

    const lines = buildLines(properties)
    if (!lines) continue

    // Photon happily returns the same place as both a node and a way.
    const dedupeKey = `${lines.primary}|${lines.secondary}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    suggestions.push({
      id: `${properties.osm_type ?? 'x'}${properties.osm_id ?? seen.size}`,
      primary: lines.primary,
      secondary: lines.secondary,
      lat,
      lng,
    })

    if (suggestions.length >= 6) break
  }

  return { suggestions, sawNonUsMatches }
}

/**
 * Recover a display label for bare coordinates, so a hand-typed or truncated
 * shared URL still renders with a real address instead of a number pair.
 */
export async function reverseLabel(center: LatLng): Promise<string | null> {
  const url = `${BASE}/reverse?lat=${center.lat}&lon=${center.lng}&lang=en`

  try {
    const data = await fetchJson<PhotonResponse>(url, {
      revalidate: CACHE_SECONDS,
      timeoutMs: 6000,
    })
    const properties = data.features?.[0]?.properties
    if (!properties) return null

    const lines = buildLines(properties)
    if (!lines) return null

    return lines.secondary ? `${lines.primary}, ${lines.secondary}` : lines.primary
  } catch {
    return null
  }
}
