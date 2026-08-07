import { describe, expect, it } from 'vitest'

import { isSpecialUseTract } from './census'

describe('isSpecialUseTract', () => {
  it('flags the 9800 to 9899 special land-use range', () => {
    // 1600 Pennsylvania Avenue resolves to tract 980000, covering the National
    // Mall and the surrounding federal land.
    expect(isSpecialUseTract('980000')).toBe(true)
    expect(isSpecialUseTract('989900')).toBe(true)
    expect(isSpecialUseTract('985001')).toBe(true)
  })

  it('leaves ordinary residential tracts alone', () => {
    expect(isSpecialUseTract('022801')).toBe(false) // San Francisco Mission
    expect(isSpecialUseTract('846523')).toBe(false) // Naperville
    expect(isSpecialUseTract('971800')).toBe(false) // rural Nebraska
    expect(isSpecialUseTract('979900')).toBe(false) // just below the range
    expect(isSpecialUseTract('990000')).toBe(false) // just above the range
  })

  it('does not throw on malformed input', () => {
    expect(isSpecialUseTract('')).toBe(false)
    expect(isSpecialUseTract('abc')).toBe(false)
  })
})
