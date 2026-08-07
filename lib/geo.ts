/**
 * Geospatial primitives. Pure functions, no I/O, no framework imports, so the
 * scoring layer and the tests can use them freely on both server and client.
 */

export interface LatLng {
  lat: number
  lng: number
}

/** IUGG mean Earth radius in metres. */
const EARTH_RADIUS_M = 6_371_008.8

export const METERS_PER_MILE = 1609.344
export const METERS_PER_FOOT = 0.3048

/** Radius used for the walking score and the map circle. */
export const WALK_RADIUS_MI = 1
/** Radius used for the driving score. */
export const DRIVE_RADIUS_MI = 5

export const WALK_RADIUS_M = WALK_RADIUS_MI * METERS_PER_MILE
export const DRIVE_RADIUS_M = DRIVE_RADIUS_MI * METERS_PER_MILE

/**
 * Average walking speed, used to turn a distance into "about N min walk".
 * 3.1 mph is the figure the US DOT uses for pedestrian crossing timing.
 */
const WALK_METERS_PER_MINUTE = 83

const toRadians = (deg: number): number => (deg * Math.PI) / 180

/**
 * Great-circle distance in metres.
 *
 * Haversine treats the Earth as a sphere, which is off by roughly 0.3% versus
 * a proper ellipsoidal calculation. At the 1 to 5 mile ranges here that is a
 * few metres, far below the positional error already present in OSM data, so
 * the extra complexity of Vincenty is not worth it.
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)

  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)

  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

export const metersToMiles = (m: number): number => m / METERS_PER_MILE
export const metersToFeet = (m: number): number => m / METERS_PER_FOOT

/** Whole minutes of walking, floored at 1 so nothing reads as "0 min walk". */
export function walkMinutes(meters: number): number {
  return Math.max(1, Math.round(meters / WALK_METERS_PER_MINUTE))
}

/** Human-readable distance: feet under a quarter mile, miles above it. */
export function formatDistance(meters: number): string {
  if (meters < METERS_PER_MILE / 4) {
    return `${Math.round(metersToFeet(meters) / 10) * 10} ft`
  }
  return `${metersToMiles(meters).toFixed(1)} mi`
}

/** Area of a circle of the given radius, in square miles. */
export function circleAreaSqMi(radiusMi: number): number {
  return Math.PI * radiusMi * radiusMi
}

const SQ_METERS_PER_SQ_MILE = METERS_PER_MILE * METERS_PER_MILE

export function sqMetersToSqMiles(sqM: number): number {
  return sqM / SQ_METERS_PER_SQ_MILE
}

/* -------------------------------------------------------------------------- */
/* URL coordinate encoding                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Coordinates are the whole identity of an insights page: they appear in the
 * URL and every number on the page derives from them. That is what makes a
 * shared link render identically for someone else, with no database and no
 * link that can expire.
 *
 * Six decimal places is roughly 11 cm, well past what any geocoder resolves,
 * and it keeps the URL stable so the cache key stays stable too.
 */
const COORD_DECIMALS = 6

export function formatCoordParam({ lat, lng }: LatLng): string {
  return `${lat.toFixed(COORD_DECIMALS)},${lng.toFixed(COORD_DECIMALS)}`
}

/**
 * Parse the `[coords]` route segment. Returns null for anything malformed so
 * callers can render a 404 instead of trusting user-controlled input.
 */
export function parseCoordParam(raw: string): LatLng | null {
  if (typeof raw !== 'string') return null

  // Tolerate an encoded comma, since some clients escape it in shared links.
  const normalized = raw.replace(/%2C/gi, ',').trim()
  const parts = normalized.split(',')
  if (parts.length !== 2) return null

  const [latRaw, lngRaw] = parts
  if (!latRaw || !lngRaw) return null

  // Number() would accept "0x1e", " 12 " and "Infinity". Be explicit instead.
  if (!/^-?\d{1,3}(\.\d+)?$/.test(latRaw)) return null
  if (!/^-?\d{1,3}(\.\d+)?$/.test(lngRaw)) return null

  const lat = Number(latRaw)
  const lng = Number(lngRaw)

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90) return null
  if (lng < -180 || lng > 180) return null

  return { lat, lng }
}
