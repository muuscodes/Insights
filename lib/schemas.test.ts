import { describe, expect, it } from 'vitest'

import {
  coordParamsSchema,
  historySchema,
  labelSchema,
  latLngSchema,
  suggestQuerySchema,
} from './schemas'

describe('suggestQuerySchema', () => {
  it('rejects queries that are too short to be useful', () => {
    expect(suggestQuerySchema.safeParse('ab').success).toBe(false)
    expect(suggestQuerySchema.safeParse('   ').success).toBe(false)
  })

  it('rejects an oversized query rather than forwarding it upstream', () => {
    expect(suggestQuerySchema.safeParse('a'.repeat(121)).success).toBe(false)
  })

  it('accepts and trims a normal address fragment', () => {
    const parsed = suggestQuerySchema.safeParse('  1600 Pennsylvania Ave  ')
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data).toBe('1600 Pennsylvania Ave')
  })
})

describe('latLngSchema', () => {
  it.each([
    ['NaN latitude', { lat: Number.NaN, lng: 0 }],
    ['infinite longitude', { lat: 0, lng: Number.POSITIVE_INFINITY }],
    ['latitude out of range', { lat: 91, lng: 0 }],
    ['longitude out of range', { lat: 0, lng: 181 }],
  ])('rejects %s', (_label, input) => {
    expect(latLngSchema.safeParse(input).success).toBe(false)
  })

  it('accepts the range boundaries', () => {
    expect(latLngSchema.safeParse({ lat: 90, lng: 180 }).success).toBe(true)
    expect(latLngSchema.safeParse({ lat: -90, lng: -180 }).success).toBe(true)
  })
})

describe('coordParamsSchema', () => {
  it('rejects a missing parameter instead of coercing it to zero', () => {
    // Number(null) and Number('') are both 0, which would read a parameterless
    // request as a valid point in the Gulf of Guinea.
    expect(coordParamsSchema.safeParse({ lat: undefined, lng: undefined }).success).toBe(false)
    expect(coordParamsSchema.safeParse({ lat: '38.9', lng: undefined }).success).toBe(false)
    expect(coordParamsSchema.safeParse({ lat: '', lng: '' }).success).toBe(false)
    expect(coordParamsSchema.safeParse({ lat: '   ', lng: '   ' }).success).toBe(false)
  })

  it('still accepts a genuine zero coordinate', () => {
    const parsed = coordParamsSchema.safeParse({ lat: '0', lng: '0' })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data).toEqual({ lat: 0, lng: 0 })
  })

  it('rejects values Number() would otherwise accept', () => {
    for (const bad of ['0x1e', 'Infinity', '1e5', 'NaN', '38.9abc']) {
      expect(coordParamsSchema.safeParse({ lat: bad, lng: '0' }).success, bad).toBe(false)
    }
  })

  it('parses valid decimal strings', () => {
    const parsed = coordParamsSchema.safeParse({ lat: '38.897600', lng: '-77.036500' })
    expect(parsed.success && parsed.data).toEqual({ lat: 38.8976, lng: -77.0365 })
  })

  it('enforces the coordinate ranges after parsing', () => {
    expect(coordParamsSchema.safeParse({ lat: '91', lng: '0' }).success).toBe(false)
    expect(coordParamsSchema.safeParse({ lat: '0', lng: '181' }).success).toBe(false)
  })
})

describe('labelSchema', () => {
  it('rejects an empty or oversized label', () => {
    expect(labelSchema.safeParse('').success).toBe(false)
    expect(labelSchema.safeParse('x'.repeat(201)).success).toBe(false)
  })
})

describe('historySchema', () => {
  it('rejects a tampered entry with an impossible coordinate', () => {
    const tampered = [{ label: 'Nowhere', lat: 999, lng: 0, at: Date.now() }]
    expect(historySchema.safeParse(tampered).success).toBe(false)
  })

  it('rejects an entry missing its timestamp', () => {
    expect(historySchema.safeParse([{ label: 'A', lat: 1, lng: 1 }]).success).toBe(false)
  })

  it('rejects a history longer than the cap', () => {
    const many = Array.from({ length: 51 }, () => ({ label: 'A', lat: 1, lng: 1, at: 1 }))
    expect(historySchema.safeParse(many).success).toBe(false)
  })

  it('accepts a well-formed history', () => {
    const good = [{ label: '1600 Pennsylvania Ave NW', lat: 38.8977, lng: -77.0365, at: 1 }]
    expect(historySchema.safeParse(good).success).toBe(true)
  })
})
