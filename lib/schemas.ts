import { z } from 'zod'

/**
 * Validation for anything that crosses a trust boundary: route query strings,
 * route params, and values read back out of localStorage. Nothing downstream
 * accepts a raw string from the outside world.
 */

/** Autocomplete query. Bounded so a caller cannot push a huge string upstream. */
export const suggestQuerySchema = z
  .string()
  .trim()
  .min(3, 'Enter at least 3 characters')
  .max(120, 'Query too long')

export const latSchema = z.number().finite().min(-90).max(90)
export const lngSchema = z.number().finite().min(-180).max(180)

export const latLngSchema = z.object({
  lat: latSchema,
  lng: lngSchema,
})

/**
 * Coordinates arriving as query-string text.
 *
 * Worth its own schema because `Number(null)` and `Number('')` are both 0, so
 * coercing first and validating after would read a request with no parameters
 * at all as the coordinates of the Gulf of Guinea and happily go build a report
 * for the open ocean.
 */
const numericParam = z
  .string()
  .trim()
  .regex(/^-?\d{1,3}(\.\d+)?$/, 'Must be a decimal number')
  .transform(Number)

export const coordParamsSchema = z.object({
  lat: numericParam.pipe(latSchema),
  lng: numericParam.pipe(lngSchema),
})

/** Optional human-readable label carried in `?q=`. Display only, never trusted. */
export const labelSchema = z.string().trim().min(1).max(200)

/**
 * A stored search history entry. Applied on read, because localStorage is
 * user-writable: a tampered or stale entry must not be able to inject markup
 * or an off-planet coordinate into the UI.
 */
export const historyEntrySchema = z.object({
  label: labelSchema,
  lat: latSchema,
  lng: lngSchema,
  at: z.number().int().positive(),
})

export const historySchema = z.array(historyEntrySchema).max(50)

export type HistoryEntry = z.infer<typeof historyEntrySchema>
