'use client'

import { Globe2, Loader2, MapPin, Search } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { formatCoordParam } from '@/lib/geo'
import { pushHistory } from '@/lib/history'

interface Suggestion {
  id: string
  primary: string
  secondary: string
  lat: number
  lng: number
}

const DEBOUNCE_MS = 220
const MIN_CHARS = 3

export function AddressSearch({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter()
  const listId = useId()

  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [nonUsOnly, setNonUsOnly] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [loading, setLoading] = useState(false)
  const [navigating, setNavigating] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  // Tracks the newest request so a slow earlier response cannot overwrite a
  // fresher one that already landed.
  const requestId = useRef(0)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < MIN_CHARS) {
      setSuggestions([])
      setNonUsOnly(false)
      setOpen(false)
      setLoading(false)
      return
    }

    setLoading(true)
    const id = ++requestId.current
    const controller = new AbortController()

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/info/suggest?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        })
        const data = (await response.json()) as {
          suggestions?: Suggestion[]
          sawNonUsMatches?: boolean
        }
        if (id !== requestId.current) return

        const found = data.suggestions ?? []
        setSuggestions(found)
        setNonUsOnly(found.length === 0 && Boolean(data.sawNonUsMatches))
        setOpen(found.length > 0)
        setActive(-1)
      } catch {
        if (id === requestId.current) setSuggestions([])
      } finally {
        if (id === requestId.current) setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  const go = useCallback(
    (suggestion: Suggestion) => {
      const label = [suggestion.primary, suggestion.secondary].filter(Boolean).join(', ')

      setNavigating(true)
      setOpen(false)
      pushHistory({ label, lat: suggestion.lat, lng: suggestion.lng })

      const coords = formatCoordParam({ lat: suggestion.lat, lng: suggestion.lng })
      router.push(`/info/insights/${coords}?q=${encodeURIComponent(label)}`)
    },
    [router],
  )

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActive((index) => Math.min(index + 1, suggestions.length - 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(index - 1, -1))
      return
    }
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      // Falling back to the first suggestion means Enter always does something
      // sensible, even if the arrow keys were never touched.
      const choice = suggestions[active] ?? suggestions[0]
      if (choice) go(choice)
    }
  }

  const noUsMatch = query.trim().length >= MIN_CHARS && !loading && suggestions.length === 0

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex items-stretch gap-2 rounded-pill bg-white p-2 shadow-[0_10px_36px_-14px_rgba(20,16,12,0.55)]">
        <span className="grid w-10 shrink-0 place-items-center text-ink-faint">
          <Search size={18} aria-hidden />
        </span>

        <input
          type="text"
          value={query}
          autoFocus={autoFocus}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder="Try 1600 Pennsylvania Ave NW"
          aria-label="Street address"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-faint sm:text-lg"
        />

        <button
          type="button"
          disabled={navigating || suggestions.length === 0}
          onClick={() => {
            const choice = suggestions[active] ?? suggestions[0]
            if (choice) go(choice)
          }}
          className="inline-flex shrink-0 items-center gap-2 rounded-pill bg-berry px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-ink disabled:cursor-not-allowed disabled:bg-edge-strong disabled:text-white"
        >
          {navigating ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
          {navigating ? 'Loading' : "Let's look"}
        </button>
      </div>

      <div className="mt-3 min-h-[1.5rem] px-2">
        {loading ? (
          <p className="text-sm text-ink-faint">Looking...</p>
        ) : nonUsOnly ? (
          <p className="inline-flex items-start gap-2 rounded-2xl bg-honey-wash px-3.5 py-2 text-sm text-ink">
            <Globe2 size={16} className="mt-0.5 shrink-0 text-honey" aria-hidden />
            <span>
              That looks like an address outside the US. Non-US addresses will be available in an
              upcoming release.
            </span>
          </p>
        ) : noUsMatch ? (
          <p className="text-sm text-ink-faint">No US address matched that yet. Keep typing.</p>
        ) : null}
      </div>

      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-3xl border border-edge bg-white p-2 shadow-[0_22px_48px_-20px_rgba(20,16,12,0.5)]"
        >
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.id} id={`${listId}-${index}`} role="option" aria-selected={index === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(index)}
                onClick={() => go(suggestion)}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${
                  index === active ? 'bg-berry-wash' : 'bg-transparent hover:bg-cream-deep'
                }`}
              >
                <MapPin
                  size={16}
                  aria-hidden
                  className={index === active ? 'shrink-0 text-berry' : 'shrink-0 text-ink-faint'}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[0.95rem] font-medium text-ink">
                    {suggestion.primary}
                  </span>
                  <span className="block truncate text-sm text-ink-faint">{suggestion.secondary}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
