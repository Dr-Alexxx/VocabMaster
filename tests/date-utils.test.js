import { createRequire } from 'node:module'
import { describe, expect, test } from 'vitest'

const require = createRequire(import.meta.url)
const { localDateKey, addLocalDays } = require('../electron/date-utils.cjs')

describe('local date keys', () => {
  test('keeps the local calendar date right after midnight', () => {
    expect(localDateKey(new Date(2026, 8, 25, 0, 15))).toBe('2026-09-25')
  })

  test('keeps the local calendar date late in the evening', () => {
    expect(localDateKey(new Date(2026, 8, 25, 23, 30))).toBe('2026-09-25')
  })

  test('shifts forward across a month boundary', () => {
    expect(addLocalDays(new Date(2026, 8, 30), 2)).toBe('2026-10-02')
  })

  test('shifts forward across a year boundary', () => {
    expect(addLocalDays(new Date(2026, 11, 31), 1)).toBe('2027-01-01')
  })

  test('shifts backward across a month boundary', () => {
    expect(addLocalDays(new Date(2026, 9, 2), -2)).toBe('2026-09-30')
  })
})
