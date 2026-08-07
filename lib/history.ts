import { historySchema, type HistoryEntry } from './schemas'

/**
 * Recent lookups, stored on the device only. Nothing here is ever sent to the
 * server, which is why it is also the one place the app trusts nothing: the
 * store is user-writable, so every read is validated before anything reaches
 * the UI.
 */

const STORAGE_KEY = 'info:search-history'
const MAX_ENTRIES = 8

export type { HistoryEntry }

export function readHistory(): HistoryEntry[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    const parsed = historySchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return []

    return parsed.data.slice(0, MAX_ENTRIES)
  } catch {
    // Corrupt JSON, or storage blocked entirely in private mode.
    return []
  }
}

export function pushHistory(entry: Omit<HistoryEntry, 'at'>): HistoryEntry[] {
  if (typeof window === 'undefined') return []

  const candidate = { ...entry, at: Date.now() }
  const parsed = historySchema.safeParse([candidate])
  if (!parsed.success) return readHistory()

  const existing = readHistory().filter(
    (item) => !(item.lat === candidate.lat && item.lng === candidate.lng),
  )
  const next = [candidate, ...existing].slice(0, MAX_ENTRIES)

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage full or unavailable. History is a convenience, not a requirement.
  }

  return next
}

export function clearHistory(): HistoryEntry[] {
  if (typeof window === 'undefined') return []
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do.
  }
  return []
}
