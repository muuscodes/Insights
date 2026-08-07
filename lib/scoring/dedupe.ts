import { haversineMeters } from '../geo'
import type { Poi } from '../types'
import type { CategoryKey } from './taxonomy'

/**
 * Collapse features that describe the same real place.
 *
 * OpenStreetMap maps one place as many features. Within a mile of the White
 * House, 652 features classify as parks, of which 568 are unnamed and 628 are
 * way polygons: a single park is drawn as a dozen adjacent pieces, plus its
 * paths, lawns and sports fields. Reporting "652 parks" is nonsense, and it is
 * what a naive count does.
 *
 * Two passes, both deliberately conservative so genuinely separate places are
 * never merged:
 *
 *   1. Same category, same name, close together. Two branches of a chain a
 *      half mile apart stay two; twelve polygons all called "President's Park"
 *      become one.
 *   2. Same category, both unnamed, close together, and only for categories
 *      that get drawn as areas. A park's lawn, path and playground collapse
 *      into the park. This never applies to restaurants or shops, where two
 *      unnamed points twenty metres apart really are two different places.
 */

/** Same name within this distance is the same place, not a second branch. */
const SAME_NAME_M = 250

/**
 * Two area features closer together than this are one place.
 *
 * Tuned against downtown Washington DC, which is the hard case: the L'Enfant
 * plan left dozens of genuinely separate squares, and they sit 200 m or more
 * apart (Lafayette 209 m, Sherman 264 m, McPherson 522 m). Meanwhile the White
 * House putting green, playground and basketball court sit within 100 m of
 * President's Park and are plainly not three extra parks. 200 m separates those
 * two cases cleanly.
 */
const FRAGMENT_M = 200

/**
 * Categories OSM draws as polygons, which is where fragmentation happens.
 * Point-like categories are excluded on purpose.
 */
const AREA_CATEGORIES: ReadonlySet<CategoryKey> = new Set<CategoryKey>([
  'park',
  'school',
  'healthcare',
])

const normalizeName = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ')

export function dedupePois(pois: readonly Poi[]): Poi[] {
  // Nearest first, so the survivor of any merge is the closest one, which is
  // also the one the score and the "nearest" readout should use.
  const sorted = [...pois].sort((a, b) => a.distanceM - b.distanceM)

  const keptByCategory = new Map<CategoryKey, Poi[]>()
  const kept: Poi[] = []

  for (const poi of sorted) {
    const siblings = keptByCategory.get(poi.category) ?? []
    const name = poi.name ? normalizeName(poi.name) : null

    const isArea = AREA_CATEGORIES.has(poi.category)

    const duplicate = siblings.some((other) => {
      const gap = haversineMeters(other, poi)

      // Area categories merge on proximity alone, names ignored. Distinct parks
      // are far enough apart that this is safe, and it is the only rule that
      // catches a named sub-feature sitting inside a named parent.
      if (isArea) return gap <= FRAGMENT_M

      // Point-like categories only merge when the name matches, because two
      // unnamed restaurants twenty metres apart really are two restaurants.
      const otherName = other.name ? normalizeName(other.name) : null
      if (!name || !otherName) return false
      return name === otherName && gap <= SAME_NAME_M
    })

    if (duplicate) continue

    kept.push(poi)
    siblings.push(poi)
    keptByCategory.set(poi.category, siblings)
  }

  return kept
}
