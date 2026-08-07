'use client'

import { Check, Link2, Loader2 } from 'lucide-react'
import { useState } from 'react'

type State = 'idle' | 'working' | 'copied'

/**
 * The page URL already contains everything needed to reproduce the report, so
 * sharing is just copying a link. It gets run through TinyURL first, because a
 * raw coordinate URL is ugly to paste into a text message.
 */
export function ShareLink() {
  const [state, setState] = useState<State>('idle')
  const [shortUrl, setShortUrl] = useState<string | null>(null)

  const share = async () => {
    if (state === 'working') return
    setState('working')

    const fullUrl = window.location.href
    let url = shortUrl ?? fullUrl

    if (!shortUrl) {
      try {
        const path = window.location.pathname + window.location.search
        const response = await fetch(`/api/info/shorten?path=${encodeURIComponent(path)}`)
        const data = (await response.json()) as { url?: string }
        if (data.url) {
          url = data.url
          setShortUrl(data.url)
        }
      } catch {
        // Fall back to the full URL, which works just as well.
      }
    }

    try {
      await navigator.clipboard.writeText(url)
      setState('copied')
      setTimeout(() => setState('idle'), 2200)
    } catch {
      // Clipboard is blocked without a user gesture in some browsers and over
      // plain http. The URL is still in the address bar.
      setState('idle')
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={share}
        disabled={state === 'working'}
        className="inline-flex items-center gap-2 rounded-pill bg-ink px-5 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-berry disabled:opacity-70"
      >
        {state === 'working' ? (
          <Loader2 size={16} className="animate-spin" aria-hidden />
        ) : state === 'copied' ? (
          <Check size={16} aria-hidden />
        ) : (
          <Link2 size={16} aria-hidden />
        )}
        {state === 'copied' ? 'Copied' : state === 'working' ? 'Making a link' : 'Share this'}
      </button>

      {shortUrl && state === 'copied' ? (
        <span className="text-xs text-ink-faint">{shortUrl}</span>
      ) : null}
    </div>
  )
}
