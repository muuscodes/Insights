import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV === 'development'

/**
 * MapLibre renders tiles in a web worker created from a blob, and pulls vector
 * tiles + glyphs from OpenFreeMap, so those two origins have to be allowed
 * explicitly. Everything else is locked to 'self'.
 *
 * 'unsafe-eval' is dev-only (React Refresh needs it). 'unsafe-inline' for
 * scripts is required by Next's inlined hydration bootstrap; moving to a
 * nonce-based CSP would mean routing every response through middleware, which
 * is not worth it at this size. Noted in the README as a known tradeoff.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tiles.openfreemap.org",
  "font-src 'self' data:",
  "connect-src 'self' https://tiles.openfreemap.org",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
