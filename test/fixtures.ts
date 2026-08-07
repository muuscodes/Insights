import type { Poi, TaggedFeature } from '@/lib/types'
import { classify } from '@/lib/scoring/taxonomy'

/**
 * Tag shapes copied from real Overpass responses captured while building this,
 * so the tests exercise payloads the providers actually produce rather than
 * idealised ones. The San Francisco Mission probe is the source of the cuisine
 * distribution below (61 Mexican, 45 coffee shops, 22 pizza).
 */

let counter = 0

export function feature(tags: Record<string, string>, distanceM: number): TaggedFeature {
  counter += 1
  return {
    id: `node/${counter}`,
    name: tags.name ?? null,
    lat: 37.76,
    lng: -122.41,
    distanceM,
    tags,
  }
}

/** Build a Poi, failing loudly if the tags do not actually classify. */
export function poi(tags: Record<string, string>, distanceM: number): Poi {
  const category = classify(tags)
  if (!category) throw new Error(`Fixture tags do not classify: ${JSON.stringify(tags)}`)
  return { ...feature(tags, distanceM), category }
}

/** Street furniture that dominates raw Overpass output and must score zero. */
export const NOISE_FEATURES: Record<string, string>[] = [
  { amenity: 'bench' },
  { amenity: 'waste_basket' },
  { amenity: 'bicycle_parking' },
  { amenity: 'parking_entrance' },
  { amenity: 'drinking_water' },
  { amenity: 'post_box' },
  { shop: 'vacant' },
]
