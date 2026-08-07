import type { Metadata, Viewport } from 'next'
import { Fraunces, Outfit } from 'next/font/google'

import './globals.css'

/*
  Fraunces is a soft, slightly wonky serif and Outfit is a friendly geometric
  sans. Picked together to keep the tone relaxed rather than corporate.

  next/font self-hosts both at build time, so they are served from this origin
  and satisfy the `font-src 'self'` content security policy. No external
  stylesheet, no render-blocking request to a font CDN.
*/
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
})

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Address Insights',
  description:
    'Type a street address and find out what the neighborhood is actually like: how walkable it is, who lives there, and what the block smells like.',
}

export const viewport: Viewport = {
  themeColor: '#fdf9f3',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${outfit.variable}`}>
      <body>{children}</body>
    </html>
  )
}
