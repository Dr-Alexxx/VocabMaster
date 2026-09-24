import { createRequire } from 'node:module'
import { describe, expect, test } from 'vitest'

const require = createRequire(import.meta.url)
const { daysBetween, planDailyNewQuota } = require('../electron/study-goal.cjs')

describe('study goal scheduling', () => {
  test('measures whole days between date keys', () => {
    expect(daysBetween('2026-09-24', '2026-10-01')).toBe(7)
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
    expect(daysBetween('2026-10-01', '2026-09-24')).toBe(-7)
  })

  test('falls back to the base limit without a deadline', () => {
    expect(planDailyNewQuota({ remainingWords: 100, deadlineKey: '', todayKey: '2026-09-24', baseLimit: 20 }))
      .toEqual({ quota: 20, daysLeft: null, feasible: true })
    expect(planDailyNewQuota({ remainingWords: 100, deadlineKey: null, todayKey: '2026-09-24', baseLimit: 20 }))
      .toEqual({ quota: 20, daysLeft: null, feasible: true })
  })

  test('spreads remaining words evenly across the days left', () => {
    expect(planDailyNewQuota({ remainingWords: 100, deadlineKey: '2026-10-03', todayKey: '2026-09-24', baseLimit: 20, maxLimit: 200 }))
      .toEqual({ quota: 10, daysLeft: 10, feasible: true })
    expect(planDailyNewQuota({ remainingWords: 101, deadlineKey: '2026-10-03', todayKey: '2026-09-24', baseLimit: 20, maxLimit: 200 }))
      .toEqual({ quota: 11, daysLeft: 10, feasible: true })
  })

  test('treats the deadline day itself as one remaining study day', () => {
    expect(planDailyNewQuota({ remainingWords: 30, deadlineKey: '2026-09-24', todayKey: '2026-09-24', baseLimit: 20, maxLimit: 200 }))
      .toEqual({ quota: 30, daysLeft: 1, feasible: true })
  })

  test('caps the quota and reports an infeasible plan', () => {
    const result = planDailyNewQuota({ remainingWords: 500, deadlineKey: '2026-09-25', todayKey: '2026-09-24', baseLimit: 20, maxLimit: 50 })
    expect(result).toEqual({ quota: 50, daysLeft: 2, feasible: false })
  })

  test('keeps the base limit once nothing remains', () => {
    expect(planDailyNewQuota({ remainingWords: 0, deadlineKey: '2026-10-03', todayKey: '2026-09-24', baseLimit: 20, maxLimit: 200 }))
      .toEqual({ quota: 20, daysLeft: 0, feasible: true })
  })
})
