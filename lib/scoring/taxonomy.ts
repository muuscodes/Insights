/**
 * OSM tag taxonomy.
 *
 * A 1-mile Overpass query around a dense address returns thousands of tagged
 * features, and most of them are street furniture. A live probe around the
 * White House returned 3,106 features of which 977 were benches, plus waste
 * baskets, bicycle parking and parking entrances. Counting raw features would
 * score a park bench the same as a grocery store.
 *
 * So this is a whitelist, not a blacklist: a feature contributes only if it
 * maps to one of the categories below. Anything unrecognised is ignored.
 */

export type CategoryKey =
  | 'grocery'
  | 'restaurant'
  | 'cafe'
  | 'retail'
  | 'services'
  | 'school'
  | 'park'
  | 'healthcare'
  | 'transit'
  | 'entertainment'

export interface CategoryDef {
  key: CategoryKey
  label: string
  /** Colour token used for map pins and the category legend. */
  color: string
  /**
   * Weight when walking. Daily essentials you would actually walk to score
   * highest: groceries, transit, parks, healthcare.
   */
  walkWeight: number
  /**
   * Weight when driving. Destinations worth a car trip score highest, and
   * things nobody drives five miles for score near zero.
   */
  driveWeight: number
}

export const CATEGORIES: readonly CategoryDef[] = [
  { key: 'grocery', label: 'Groceries', color: '#3f9068', walkWeight: 3.0, driveWeight: 3.0 },
  { key: 'transit', label: 'Transit', color: '#3d84c6', walkWeight: 2.5, driveWeight: 0.4 },
  { key: 'park', label: 'Parks', color: '#6bb04a', walkWeight: 2.0, driveWeight: 1.0 },
  { key: 'healthcare', label: 'Healthcare', color: '#e05a47', walkWeight: 2.0, driveWeight: 2.5 },
  { key: 'restaurant', label: 'Restaurants', color: '#f0873c', walkWeight: 2.0, driveWeight: 1.2 },
  { key: 'school', label: 'Schools', color: '#8b5cc4', walkWeight: 1.5, driveWeight: 2.0 },
  { key: 'retail', label: 'Shopping', color: '#dd9a2b', walkWeight: 1.5, driveWeight: 2.2 },
  { key: 'services', label: 'Services', color: '#7c8b94', walkWeight: 1.5, driveWeight: 1.6 },
  { key: 'entertainment', label: 'Fun stuff', color: '#d857a0', walkWeight: 1.5, driveWeight: 1.8 },
  { key: 'cafe', label: 'Cafes', color: '#a5714b', walkWeight: 1.5, driveWeight: 0.3 },
] as const

export const CATEGORY_BY_KEY: Record<CategoryKey, CategoryDef> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c]),
) as Record<CategoryKey, CategoryDef>

/**
 * Ordered match rules; first hit wins. Order matters where one feature could
 * plausibly land in two buckets, e.g. a pharmacy is healthcare rather than
 * retail, and a bakery is groceries rather than a cafe.
 */
const RULES: ReadonlyArray<{ tag: string; values: readonly string[]; category: CategoryKey }> = [
  {
    tag: 'amenity',
    values: ['pharmacy', 'hospital', 'clinic', 'doctors', 'dentist', 'veterinary'],
    category: 'healthcare',
  },
  {
    tag: 'shop',
    values: [
      'supermarket',
      'grocery',
      'convenience',
      'greengrocer',
      'butcher',
      'bakery',
      'deli',
      'health_food',
      'farm',
      'seafood',
      'fishmonger',
    ],
    category: 'grocery',
  },
  { tag: 'amenity', values: ['marketplace'], category: 'grocery' },
  { tag: 'amenity', values: ['restaurant', 'fast_food', 'food_court'], category: 'restaurant' },
  { tag: 'amenity', values: ['cafe', 'ice_cream'], category: 'cafe' },
  { tag: 'shop', values: ['coffee', 'tea', 'pastry', 'confectionery'], category: 'cafe' },
  {
    tag: 'amenity',
    values: ['bar', 'pub', 'biergarten', 'nightclub', 'cinema', 'theatre', 'arts_centre', 'casino'],
    category: 'entertainment',
  },
  { tag: 'tourism', values: ['museum', 'gallery', 'artwork', 'zoo', 'aquarium'], category: 'entertainment' },
  { tag: 'leisure', values: ['fitness_centre', 'sports_centre', 'bowling_alley'], category: 'entertainment' },
  {
    tag: 'amenity',
    values: ['school', 'kindergarten', 'college', 'university', 'library', 'childcare'],
    category: 'school',
  },
  {
    tag: 'leisure',
    values: ['park', 'garden', 'playground', 'dog_park', 'nature_reserve', 'pitch', 'recreation_ground'],
    category: 'park',
  },
  { tag: 'amenity', values: ['bus_station', 'ferry_terminal'], category: 'transit' },
  { tag: 'highway', values: ['bus_stop'], category: 'transit' },
  { tag: 'railway', values: ['station', 'halt', 'tram_stop', 'subway_entrance'], category: 'transit' },
  {
    tag: 'amenity',
    values: ['bank', 'post_office', 'fuel', 'car_wash', 'townhall', 'police', 'fire_station'],
    category: 'services',
  },
  {
    tag: 'shop',
    values: ['hairdresser', 'laundry', 'dry_cleaning', 'beauty', 'optician', 'car_repair', 'copyshop', 'travel_agency'],
    category: 'services',
  },
  // Anything else tagged shop= is general retail. Keep this last so the more
  // specific shop rules above win.
  { tag: 'shop', values: ['*'], category: 'retail' },
]

/**
 * Features that are deliberately worth zero. Not needed for correctness (the
 * whitelist already ignores them) but kept explicit so the intent is legible
 * and the tests can assert it directly.
 */
export const KNOWN_NOISE_TAGS: readonly string[] = [
  'bench',
  'waste_basket',
  'waste_disposal',
  'bicycle_parking',
  'bicycle_rental',
  'parking',
  'parking_entrance',
  'parking_space',
  'drinking_water',
  'post_box',
  'recycling',
  'toilets',
  'shelter',
  'fountain',
  'clock',
  'telephone',
  'vending_machine',
  'charging_station',
  'street_lamp',
  'surveillance',
  'hunting_stand',
  'smoking_area',
  'grit_bin',
]

const NOISE_SET = new Set(KNOWN_NOISE_TAGS)

/* -------------------------------------------------------------------------- */
/* Overpass query filters                                                     */
/* -------------------------------------------------------------------------- */

export interface OsmFilter {
  tag: string
  /** '*' means "any value for this tag". */
  values: readonly string[] | '*'
}

/** Every tag the classification rules can match on. */
export const CLASSIFIED_TAGS: readonly string[] = [...new Set(RULES.map((rule) => rule.tag))]

/**
 * Filters for the 1-mile query.
 *
 * Deliberately broader than the classification rules. Overpass cost is
 * dominated by the number of spatial clauses, not by payload size, so the big
 * tags are fetched with no value filter at all and narrowed afterwards by
 * `classify`. Measured against a dense San Francisco address: twelve clauses
 * carrying value regexes timed out on two public instances, while these eight
 * returned 3,473 features in 7.1 seconds.
 *
 * Value filters survive only where the bare tag would drag in something
 * enormous: every road for `highway`, and continent-scale polygons for
 * `landuse` and `natural`.
 *
 * The last two match nothing in the scoring taxonomy. They are here for the
 * scent profile, which cares about industrial land and tree cover.
 */
export const NEAR_QUERY_FILTERS: readonly OsmFilter[] = [
  { tag: 'amenity', values: '*' },
  { tag: 'shop', values: '*' },
  { tag: 'leisure', values: '*' },
  { tag: 'tourism', values: '*' },
  { tag: 'railway', values: ['station', 'halt', 'tram_stop', 'subway_entrance'] },
  { tag: 'highway', values: ['bus_stop'] },
  { tag: 'landuse', values: ['forest', 'grass', 'meadow', 'farmland', 'industrial', 'landfill'] },
  { tag: 'natural', values: ['water', 'beach', 'wood', 'tree_row', 'scrub', 'wetland'] },
]

/**
 * Filters for the 5-mile query.
 *
 * Deliberately narrower than NEAR_FILTERS. A measured 5-mile query around Times
 * Square using the full whitelist returned 31,785 elements and 10.9 MB in 36
 * seconds, which would exceed the serverless timeout. These are the sparse,
 * genuinely drive-worthy destinations only: nobody drives five miles to a
 * convenience store, and the dense categories are already saturated from the
 * 1-mile query anyway.
 */
export const WIDE_FILTERS: Record<CategoryKey, OsmFilter[]> = {
  grocery: [{ tag: 'shop', values: ['supermarket', 'wholesale', 'greengrocer', 'butcher', 'farm'] }],
  retail: [
    {
      tag: 'shop',
      values: [
        'department_store',
        'mall',
        'hardware',
        'doityourself',
        'furniture',
        'electronics',
        'car',
        'garden_centre',
        'sports',
        'variety_store',
      ],
    },
  ],
  healthcare: [{ tag: 'amenity', values: ['hospital', 'clinic', 'doctors', 'dentist'] }],
  school: [{ tag: 'amenity', values: ['school', 'college', 'university', 'library'] }],
  entertainment: [
    { tag: 'amenity', values: ['cinema', 'theatre', 'arts_centre', 'casino'] },
    { tag: 'tourism', values: ['museum', 'gallery', 'zoo', 'aquarium'] },
    { tag: 'leisure', values: ['sports_centre', 'bowling_alley', 'fitness_centre'] },
  ],
  services: [{ tag: 'amenity', values: ['bank', 'post_office', 'fuel', 'townhall', 'police'] }],
  restaurant: [{ tag: 'amenity', values: ['restaurant'] }],
  park: [{ tag: 'leisure', values: ['park', 'nature_reserve', 'recreation_ground'] }],
  transit: [
    { tag: 'railway', values: ['station'] },
    { tag: 'amenity', values: ['bus_station', 'ferry_terminal'] },
  ],
  cafe: [{ tag: 'amenity', values: ['cafe'] }],
}

/**
 * Overpass instances, tried in order.
 *
 * `overpass.osm.ch` is deliberately absent. It is the Swiss instance and only
 * carries Switzerland, so it answers a San Francisco query with 200 OK and zero
 * elements. A failover list that trusts a status code would take that as
 * success and report a walking score of zero for the Mission District, which is
 * exactly what happened before it was removed.
 */
export const OVERPASS_MIRRORS: readonly string[] = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

/**
 * Map raw OSM tags to a scoring category, or null if the feature should not
 * count toward any score.
 */
export function classify(tags: Record<string, string> | undefined): CategoryKey | null {
  if (!tags) return null

  // Reject street furniture up front, before the wildcard shop/office rules
  // get a chance to sweep something in.
  const amenity = tags.amenity
  if (amenity && NOISE_SET.has(amenity)) return null

  // "shop=vacant" and "shop=no" are empty storefronts. They showed up in the
  // live San Francisco probe and should not count as retail.
  if (tags.shop === 'vacant' || tags.shop === 'no') return null

  // Disused or abandoned features keep their original tag in OSM.
  if (tags.disused === 'yes' || tags['disused:shop'] || tags['disused:amenity']) return null

  for (const rule of RULES) {
    const value = tags[rule.tag]
    if (!value) continue
    if (rule.values.includes('*') || rule.values.includes(value)) {
      return rule.category
    }
  }

  return null
}
