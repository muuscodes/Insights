import 'server-only'

import { sqMetersToSqMiles, type LatLng } from '../geo'
import { UpstreamError, fetchJson } from '../http'
import type { Demographics, ResolvedAddress } from '../types'

/**
 * U.S. Census Bureau.
 *
 * Three separate services, and only the last needs a key:
 *   1. Geocoder      address -> coordinates
 *   2. Geographies   coordinates -> census tract, including its land area
 *   3. Data API      tract -> ACS 5-year demographics
 *
 * This is the same public data behind neighborhood-insights.com. `AREALAND`
 * from step 2 is what makes the Urban/Suburban Index a real population density
 * rather than an invented number.
 */

const GEOCODER_BASE = 'https://geocoding.geo.census.gov/geocoder'
const DATA_BASE = 'https://api.census.gov/data'

/** Latest ACS 5-year release confirmed present in the API's dataset catalogue. */
const ACS_VINTAGE = 2023

const CACHE_GEOCODE = 60 * 60 * 24 * 30
const CACHE_ACS = 60 * 60 * 24 * 30

interface GeocodeResponse {
  result?: {
    addressMatches?: Array<{
      matchedAddress?: string
      coordinates?: { x: number; y: number }
    }>
  }
}

interface GeographiesResponse {
  result?: {
    geographies?: {
      'Census Tracts'?: Array<{
        GEOID?: string
        NAME?: string
        STATE?: string
        COUNTY?: string
        TRACT?: string
        AREALAND?: string | number
      }>
    }
  }
}

/** Forward geocode a free-text US address. Exact match only, no fuzzy search. */
export async function geocodeAddress(address: string): Promise<ResolvedAddress | null> {
  const url =
    `${GEOCODER_BASE}/locations/onelineaddress` +
    `?address=${encodeURIComponent(address)}` +
    `&benchmark=Public_AR_Current&format=json`

  const data = await fetchJson<GeocodeResponse>(url, { revalidate: CACHE_GEOCODE })
  const match = data.result?.addressMatches?.[0]
  if (!match?.coordinates) return null

  const { x: lng, y: lat } = match.coordinates
  if (typeof lat !== 'number' || typeof lng !== 'number') return null

  return {
    formatted: match.matchedAddress ?? address,
    lat,
    lng,
    tractGeoid: null,
  }
}

export interface TractInfo {
  geoid: string
  name: string
  state: string
  county: string
  tract: string
  landAreaSqMi: number | null
  /**
   * True for a special land-use tract. See `isSpecialUseTract`.
   */
  specialUse: boolean
}

/**
 * The Census Bureau reserves tract codes 9800 to 9899 for special land use:
 * parks, airports, water, large federal or institutional property. Almost
 * nobody is counted as living in one.
 *
 * This matters a lot here. 1600 Pennsylvania Avenue sits in tract 9800, which
 * covers the National Mall and reports 17 residents across 2.52 square miles.
 * Feeding that into a density index labels the middle of Washington DC
 * "Suburban", which is plainly wrong. Tracts like this are flagged so the
 * residential half of the index can be dropped rather than believed.
 */
export function isSpecialUseTract(tractCode: string): boolean {
  const major = Number(tractCode.slice(0, 4))
  return Number.isInteger(major) && major >= 9800 && major <= 9899
}

/** Resolve coordinates to their census tract, with the tract's land area. */
export async function lookupTract(center: LatLng): Promise<TractInfo | null> {
  const url =
    `${GEOCODER_BASE}/geographies/coordinates` +
    `?x=${center.lng}&y=${center.lat}` +
    `&benchmark=Public_AR_Current&vintage=Current_Current` +
    `&layers=Census%20Tracts&format=json`

  const data = await fetchJson<GeographiesResponse>(url, { revalidate: CACHE_GEOCODE })
  const tract = data.result?.geographies?.['Census Tracts']?.[0]

  if (!tract?.STATE || !tract.COUNTY || !tract.TRACT) return null

  const areaLand = Number(tract.AREALAND)

  return {
    geoid: tract.GEOID ?? `${tract.STATE}${tract.COUNTY}${tract.TRACT}`,
    name: tract.NAME ?? `Tract ${tract.TRACT}`,
    state: tract.STATE,
    county: tract.COUNTY,
    tract: tract.TRACT,
    landAreaSqMi: Number.isFinite(areaLand) && areaLand > 0 ? sqMetersToSqMiles(areaLand) : null,
    specialUse: isSpecialUseTract(tract.TRACT),
  }
}

/**
 * ACS variables. Grouped here so the parsing below stays readable.
 *   B01003_001E  total population
 *   B01002_001E  median age
 *   B19013_001E  median household income
 *   B25077_001E  median owner-occupied home value
 *   B15003_*     educational attainment for the population 25 and over
 */
const ACS_VARIABLES = [
  'NAME',
  'B01003_001E',
  'B01002_001E',
  'B19013_001E',
  'B25077_001E',
  'B15003_001E',
  'B15003_022E',
  'B15003_023E',
  'B15003_024E',
  'B15003_025E',
] as const

/**
 * The ACS encodes suppressed and not-applicable cells as large negative
 * sentinels such as -666666666. Passing those through would render a median
 * income of minus 666 million.
 */
function acsNumber(raw: string | undefined): number | null {
  if (raw === undefined || raw === null || raw === '') return null
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) return null
  return value
}

export async function fetchDemographics(tract: TractInfo): Promise<Demographics> {
  const key = process.env.CENSUS_API_KEY
  if (!key) {
    // The Data API 302s to an HTML "Missing Key" page rather than returning an
    // error status, so check up front and give an honest reason.
    throw new UpstreamError('CENSUS_API_KEY is not configured')
  }

  const url =
    `${DATA_BASE}/${ACS_VINTAGE}/acs/acs5` +
    `?get=${ACS_VARIABLES.join(',')}` +
    `&for=tract:${tract.tract}` +
    `&in=state:${tract.state}%20county:${tract.county}` +
    `&key=${encodeURIComponent(key)}`

  const rows = await fetchJson<string[][]>(url, { revalidate: CACHE_ACS })

  const header = rows[0]
  const values = rows[1]
  if (!header || !values) throw new UpstreamError('ACS returned no rows for this tract')

  const at = (variable: string): string | undefined => {
    const index = header.indexOf(variable)
    return index === -1 ? undefined : values[index]
  }

  const over25 = acsNumber(at('B15003_001E'))
  const bachelorsPlus = ['B15003_022E', 'B15003_023E', 'B15003_024E', 'B15003_025E'].reduce<
    number | null
  >((sum, variable) => {
    const value = acsNumber(at(variable))
    if (value === null) return sum
    return (sum ?? 0) + value
  }, null)

  return {
    tractName: at('NAME') ?? tract.name,
    population: acsNumber(at('B01003_001E')),
    medianAge: acsNumber(at('B01002_001E')),
    medianHouseholdIncome: acsNumber(at('B19013_001E')),
    medianHomeValue: acsNumber(at('B25077_001E')),
    bachelorsOrHigherPct:
      over25 && over25 > 0 && bachelorsPlus !== null
        ? Math.round((bachelorsPlus / over25) * 100)
        : null,
    landAreaSqMi: tract.landAreaSqMi,
    vintage: ACS_VINTAGE,
    specialUse: tract.specialUse,
  }
}
