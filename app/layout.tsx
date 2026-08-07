import type { Metadata, Viewport } from 'next'
import { Baloo_2, Nunito } from 'next/font/google'

import './globals.css'

/*
  Baloo 2 is a chunky rounded display face and Nunito is its warmer, quieter
  companion. Picked to read like a game rather than a property report.

  next/font self-hosts both at build time, so they are served from this origin
  and satisfy the `font-src 'self'` content security policy. No external
  stylesheet, no render-blocking request to a font CDN.
*/
const baloo = Baloo_2({
  subsets: ['latin'],
  variable: '--font-baloo',
  display: 'swap',
})

const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-nunito',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Address Insights',
  description:
    'Type a street address and find out what the neighborhood is actually like: how walkable it is, who lives there, and what the block smells like.',
}

export const viewport: Viewport = {
  themeColor: '#fff6e5',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${baloo.variable} ${nunito.variable}`}>
      <body>{children}</body>
    </html>
  )
}
