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
      {/*
        Stacks below the small breakpoint. Side by side, the button and the
        search icon left the field 84px wide on a 320px screen, which is not a
        usable input. Full-width button underneath is also an easier tap target.
      */}
      <div className="border-ink bg-card sm:rounded-pill flex flex-col gap-2 rounded-3xl border-[3px] p-2 shadow-[0_6px_0_var(--color-ink)] sm:flex-row sm:items-stretch">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-ink grid w-9 shrink-0 place-items-center sm:w-10">
            <Search size={20} strokeWidth={2.75} aria-hidden />
          </span>

          <input
            type="text"
            value={query}
            autoFocus={autoFocus}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            placeholder="Try 1600 Pennsylvania Ave"
            aria-label="Street address"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            className="text-ink placeholder:text-ink-faint w-full min-w-0 flex-1 bg-transparent py-1.5 text-base outline-none sm:py-0 sm:text-lg"
          />
        </div>

        <button
          type="button"
          disabled={navigating || suggestions.length === 0}
          onClick={() => {
            const choice = suggestions[active] ?? suggestions[0]
            if (choice) go(choice)
          }}
          className="slab-press rounded-pill border-ink bg-berry font-display disabled:bg-ink-faint inline-flex w-full shrink-0 items-center justify-center gap-2 border-[3px] px-6 py-3 text-base font-extrabold text-white shadow-[0_5px_0_var(--color-berry-deep)] disabled:cursor-not-allowed disabled:shadow-[0_5px_0_var(--color-ink-soft)] sm:w-auto"
        >
          {navigating ? <Loader2 size={17} className="animate-spin" aria-hidden /> : null}
          {navigating ? 'Loading' : "Let's go"}
        </button>
      </div>

      <div className="mt-3 min-h-8 px-2">
        {loading ? (
          <p className="font-display text-ink-faint font-bold">Looking...</p>
        ) : nonUsOnly ? (
          <p className="border-ink bg-sun text-ink inline-flex items-start gap-2 rounded-2xl border-[3px] px-4 py-2 text-sm">
            <Globe2 size={17} strokeWidth={2.75} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              That is an address outside the US. Non-US addresses will be available in an upcoming
              release.
            </span>
          </p>
        ) : noUsMatch ? (
          <p className="font-display text-ink-faint font-bold">
            No US address matched that yet. Keep typing.
          </p>
        ) : null}
      </div>

      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          // Capped and scrollable so a long list cannot run off a short screen.
          className="border-ink bg-card absolute z-40 mt-2 max-h-[min(20rem,45vh)] w-full overflow-y-auto rounded-3xl border-[3px] p-2 shadow-[0_6px_0_var(--color-ink)]"
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
            >
              <button
                type="button"
                onMouseEnter={() => setActive(index)}
                onClick={() => go(suggestion)}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left ${
                  index === active
                    ? 'border-ink bg-sun border-[2.5px]'
                    : 'border-[2.5px] border-transparent'
                }`}
              >
                <MapPin size={18} strokeWidth={2.75} aria-hidden className="text-ink shrink-0" />
                <span className="min-w-0">
                  <span className="font-display text-ink block truncate font-extrabold">
                    {suggestion.primary}
                  </span>
                  <span className="text-ink-soft block truncate text-sm">
                    {suggestion.secondary}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
