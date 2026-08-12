import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  MAX_TRACKED_KEYS,
  __resetRateLimitForTests,
  __trackedKeyCountForTests,
  clientKey,
  rateLimit,
} from './ratelimit'

afterEach(() => {
  __resetRateLimitForTests()
  vi.useRealTimers()
})

describe('rateLimit', () => {
  it('allows requests up to the limit and blocks the next one', () => {
    for (let i = 0; i < 3; i++) {
      expect(rateLimit('a', 3, 60_000).ok, `request ${i + 1}`).toBe(true)
    }
    expect(rateLimit('a', 3, 60_000).ok).toBe(false)
  })

  it('counts each key separately', () => {
    expect(rateLimit('a', 1, 60_000).ok).toBe(true)
    expect(rateLimit('a', 1, 60_000).ok).toBe(false)
    expect(rateLimit('b', 1, 60_000).ok).toBe(true)
  })

  it('reports the remaining budget', () => {
    expect(rateLimit('a', 3, 60_000).remaining).toBe(2)
    expect(rateLimit('a', 3, 60_000).remaining).toBe(1)
    expect(rateLimit('a', 3, 60_000).remaining).toBe(0)
  })

  it('reports a positive retry-after once blocked', () => {
    rateLimit('a', 1, 60_000)
    const blocked = rateLimit('a', 1, 60_000)
    expect(blocked.ok).toBe(false)
    expect(blocked.retryAfter).toBeGreaterThan(0)
    expect(blocked.retryAfter).toBeLessThanOrEqual(60)
  })

  it('resets after the window elapses', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))

    expect(rateLimit('a', 1, 60_000).ok).toBe(true)
    expect(rateLimit('a', 1, 60_000).ok).toBe(false)

    vi.setSystemTime(new Date('2026-01-01T00:01:01Z'))
    expect(rateLimit('a', 1, 60_000).ok).toBe(true)
  })

  it('stays bounded when every tracked key is still live', () => {
    // The hard case for the cap: a flood of unique keys inside one window, so
    // nothing has expired and sweeping expired entries alone frees nothing.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))

    for (let i = 0; i < MAX_TRACKED_KEYS + 500; i++) {
      rateLimit(`flood-${i}`, 5, 60_000)
    }

    // One over is the transient before the next insert evicts again.
    expect(__trackedKeyCountForTests()).toBeLessThanOrEqual(MAX_TRACKED_KEYS + 1)
  })

  it('still expires windows normally once they lapse', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))

    for (let i = 0; i < 10; i++) rateLimit(`k-${i}`, 5, 60_000)
    expect(__trackedKeyCountForTests()).toBe(10)

    vi.setSystemTime(new Date('2026-01-01T00:01:01Z'))
    // Re-touching one lapsed key restarts it rather than stacking a second.
    expect(rateLimit('k-0', 5, 60_000).ok).toBe(true)
    expect(__trackedKeyCountForTests()).toBe(10)
  })
})

describe('clientKey', () => {
  it('takes the leftmost forwarded address', () => {
    const request = new Request('https://example.test', {
      headers: { 'x-forwarded-for': '203.0.113.5, 70.41.3.18, 150.172.238.178' },
    })
    expect(clientKey(request)).toBe('203.0.113.5')
  })

  it('falls back to x-real-ip', () => {
    const request = new Request('https://example.test', {
      headers: { 'x-real-ip': '198.51.100.7' },
    })
    expect(clientKey(request)).toBe('198.51.100.7')
  })

  it('returns a stable placeholder when no address is present', () => {
    expect(clientKey(new Request('https://example.test'))).toBe('unknown')
  })

  it('does not crash on an empty forwarded header', () => {
    const request = new Request('https://example.test', { headers: { 'x-forwarded-for': '' } })
    expect(clientKey(request)).toBe('unknown')
  })
})
