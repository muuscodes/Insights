import { decay } from './score'
import type { ScentNote, ScentProfile, TaggedFeature } from '../types'

/**
 * Scent profile.
 *
 * Costs nothing extra at runtime: it re-reads the POI set already fetched for
 * the walking score. Smell does not carry a mile, so it uses a much tighter
 * radius than the scores do, and weights sources by how strongly they actually
 * carry. A landfill is worth several bakeries.
 */

const SCENT_RADIUS_M = 800

interface NoteDef {
  key: string
  label: string
  /** Lowercase form used inside the summary sentence. */
  inline: string
  color: string
  /** How strongly one source of this kind carries, relative to cooking smells. */
  intensity: number
  match: (tags: Record<string, string>) => boolean
}

const has = (tags: Record<string, string>, key: string, values: readonly string[]): boolean => {
  const v = tags[key]
  return v !== undefined && values.includes(v)
}

const NOTES: readonly NoteDef[] = [
  {
    key: 'funk',
    label: 'Garbage',
    inline: 'a garbage note',
    color: '#6b5b3e',
    intensity: 3,
    match: (t) =>
      has(t, 'amenity', ['waste_disposal', 'waste_transfer_station', 'recycling']) ||
      has(t, 'landuse', ['landfill']) ||
      has(t, 'man_made', ['wastewater_plant']),
  },
  {
    key: 'brine',
    label: 'Sea air',
    inline: 'sea air',
    color: '#3f7f93',
    intensity: 2.2,
    match: (t) =>
      has(t, 'natural', ['water', 'beach', 'coastline', 'bay', 'wetland']) ||
      has(t, 'leisure', ['marina']),
  },
  {
    key: 'industrial',
    label: 'Industrial',
    inline: 'an industrial edge',
    color: '#7a6a5e',
    intensity: 2,
    match: (t) =>
      has(t, 'landuse', ['industrial']) ||
      has(t, 'man_made', ['works', 'chimney']) ||
      has(t, 'amenity', ['fuel']),
  },
  {
    key: 'bakery',
    label: 'Fresh bread',
    inline: 'fresh bread',
    color: '#c69a5b',
    intensity: 1.6,
    match: (t) => has(t, 'shop', ['bakery', 'pastry', 'confectionery']),
  },
  {
    key: 'coffee',
    label: 'Coffee',
    inline: 'roasted coffee',
    color: '#8a6242',
    intensity: 1.3,
    match: (t) => has(t, 'amenity', ['cafe']) || has(t, 'shop', ['coffee']),
  },
  {
    key: 'hops',
    label: 'Beer',
    inline: 'spilled beer',
    color: '#b08b2e',
    intensity: 1.1,
    match: (t) =>
      has(t, 'amenity', ['bar', 'pub', 'biergarten']) ||
      has(t, 'craft', ['brewery']) ||
      has(t, 'microbrewery', ['yes']),
  },
  {
    key: 'food',
    label: 'Cooking',
    inline: 'cooking',
    color: '#c2703d',
    intensity: 1,
    match: (t) => has(t, 'amenity', ['restaurant', 'fast_food', 'food_court']),
  },
  {
    key: 'green',
    label: 'Cut grass and trees',
    inline: 'cut grass',
    color: '#4f8f3a',
    intensity: 0.9,
    match: (t) =>
      has(t, 'leisure', ['park', 'garden', 'dog_park', 'nature_reserve', 'recreation_ground']) ||
      has(t, 'landuse', ['forest', 'grass', 'meadow', 'farmland']) ||
      has(t, 'natural', ['wood', 'tree_row', 'scrub', 'heath']),
  },
  {
    key: 'floral',
    label: 'Flowers',
    inline: 'flowers',
    color: '#b3568f',
    intensity: 0.7,
    match: (t) => has(t, 'shop', ['florist', 'garden_centre']),
  },
]

/** Human-friendly cuisine names for the ones that actually turn up. */
const CUISINE_LABELS: Record<string, string> = {
  coffee_shop: 'coffee',
  sandwich: 'sandwiches',
  burger: 'burgers',
  pizza: 'pizza',
  mexican: 'Mexican',
  chinese: 'Chinese',
  japanese: 'Japanese',
  italian: 'Italian',
  indian: 'Indian',
  thai: 'Thai',
  american: 'American',
  vietnamese: 'Vietnamese',
  korean: 'Korean',
  sushi: 'sushi',
  seafood: 'seafood',
  barbecue: 'barbecue',
  chicken: 'fried chicken',
  breakfast: 'breakfast',
  ice_cream: 'ice cream',
  bakery: 'baked goods',
}

const prettyCuisine = (raw: string): string => CUISINE_LABELS[raw] ?? raw.replace(/_/g, ' ')

function joinWithAnd(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0] as string
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

function summarize(notes: ScentNote[]): string {
  const [first, second, third] = notes
  if (!first) return 'Quiet air. Nothing much within a block.'

  const defFor = (n: ScentNote): string =>
    NOTES.find((d) => d.key === n.key)?.inline ?? n.label.toLowerCase()

  if (!second) return `Mostly ${defFor(first)}.`

  const base = `Mostly ${defFor(first)}, with ${defFor(second)} underneath.`
  return third ? `${base} A trace of ${defFor(third)}.` : base
}

/**
 * Build the scent profile from POIs already gathered for the walking score.
 * `allTagged` may include features that no scoring category matched (parks,
 * landuse polygons, waste facilities), which is exactly why it is passed in
 * separately from the scored POI list.
 */
export function computeScentProfile(allTagged: readonly TaggedFeature[]): ScentProfile {
  const weights = new Map<string, number>()
  const cuisines = new Map<string, number>()
  const sourceCounts = new Map<string, number>()

  for (const poi of allTagged) {
    if (poi.distanceM > SCENT_RADIUS_M) continue
    const proximity = decay(poi.distanceM, SCENT_RADIUS_M)
    if (proximity <= 0) continue

    for (const note of NOTES) {
      if (!note.match(poi.tags)) continue

      weights.set(note.key, (weights.get(note.key) ?? 0) + proximity * note.intensity)
      sourceCounts.set(note.key, (sourceCounts.get(note.key) ?? 0) + 1)

      // Cuisine tags describe what is being cooked, so they belong to the
      // cooking note only. Attaching them to the coffee note as well would
      // print the same "25 Mexican, 16 coffee" string under both.
      if (note.key === 'food') {
        const raw = poi.tags.cuisine
        if (raw) {
          for (const part of raw.split(';')) {
            const cuisine = part.trim().toLowerCase()
            if (cuisine) cuisines.set(cuisine, (cuisines.get(cuisine) ?? 0) + 1)
          }
        }
      }
      // A feature can carry more than one note (a pub that serves food), so
      // keep going rather than breaking on first match.
    }
  }

  const total = [...weights.values()].reduce((a, b) => a + b, 0)
  if (total <= 0) return { notes: [], summary: summarize([]) }

  const topCuisines = [...cuisines.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => `${count} ${prettyCuisine(name)}`)

  const notes: ScentNote[] = [...weights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([key, weight]) => {
      const def = NOTES.find((n) => n.key === key)
      const count = sourceCounts.get(key) ?? 0
      const detail =
        key === 'food' && topCuisines.length > 0
          ? joinWithAnd(topCuisines)
          : `${count} ${count === 1 ? 'source' : 'sources'} nearby`

      return {
        key,
        label: def?.label ?? key,
        color: def?.color ?? '#5b6670',
        share: Math.round((weight / total) * 100),
        detail,
      }
    })

  return { notes, summary: summarize(notes) }
}
