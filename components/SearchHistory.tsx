'use client'

import { Clock3, MapPin } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { formatCoordParam } from '@/lib/geo'
import { clearHistory, readHistory, type HistoryEntry } from '@/lib/history'

/**
 * Recent lookups. Read on mount rather than during render, because
 * localStorage does not exist on the server and reading it during the first
 * client render would produce a hydration mismatch.
 */
export function SearchHistory() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)

  useEffect(() => {
    setEntries(readHistory())
  }, [])

  if (entries === null) return null

  if (entries.length === 0) {
    return (
      <div className="slab bg-cream-deep px-5 py-5">
        <p className="text-ink-soft flex items-start gap-2.5 leading-relaxed">
          <Clock3 size={18} strokeWidth={2.75} className="text-ink mt-0.5 shrink-0" aria-hidden />
          Nothing yet. Addresses you look up get saved here, on this device only.
        </p>
      </div>
    )
  }

  return (
    <div>
      <ul className="space-y-3">
        {entries.map((entry) => (
          <li key={`${entry.lat},${entry.lng}`}>
            <Link
              href={`/info/insights/${formatCoordParam(entry)}?q=${encodeURIComponent(entry.label)}`}
              className="slab slab-press flex items-center gap-3 px-4 py-3"
            >
              <MapPin size={18} strokeWidth={2.75} className="text-berry shrink-0" aria-hidden />
              <span className="text-ink min-w-0 flex-1 truncate">{entry.label}</span>
              <span className="font-display text-ink-faint shrink-0 text-xs font-extrabold">
                {new Date(entry.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setEntries(clearHistory())}
        className="font-display text-ink-faint hover:text-berry mt-4 font-bold underline decoration-2 underline-offset-4 transition-colors"
      >
        Clear history
      </button>
    </div>
  )
}
