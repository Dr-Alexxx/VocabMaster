// tests/backend-plan.test.js
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, test } from 'vitest'
const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite')
const { createAdapter } = require('../src/backend/db-adapter.cjs')
const { schema } = require('../src/backend/schema.cjs')
const { createBackend } = require('../src/backend/service.cjs')
const { addLocalDays } = require('../src/backend/date-utils.cjs')

let adapter, backend
beforeEach(async () => {
  adapter = createAdapter(new DatabaseSync(':memory:'))
  await adapter.exec(schema)
  await adapter.run("INSERT INTO vocabularies (id, name, type, is_default, is_active) VALUES (1, 'CET-4 核心词汇', 'CET4', 1, 1)")
  for (const [id, word] of [[10, 'abandon'], [11, 'ability'], [12, 'cloud']]) {
    await adapter.run('INSERT INTO words (id, vocabulary_id, word, definition) VALUES (?, 1, ?, ?)', [id, word, '["释义"]'])
  }
  await adapter.run("INSERT INTO learning_records (word_id, is_learned, next_review_date, status) VALUES (10, 1, '2026-09-28', 'review')")
  backend = createBackend(adapter, { todayKey: () => '2026-09-28', addDaysFrom: (amount) => addLocalDays(new Date(2026, 8, 28), amount) })
})

describe('study plan service', () => {
  test('daily plan mixes due reviews and new words', async () => {
    const plan = await backend.buildPlan({ dailyNewLimit: 2, dailyReviewLimit: 10 }, 'daily')
    expect(plan.reviewCount).toBe(1)
    expect(plan.newCount).toBe(2)
    expect(plan.words).toHaveLength(3)
  })
  test('goal deadline drives the daily quota', async () => {
    const plan = await backend.buildPlan({ dailyNewLimit: 2, dailyReviewLimit: 10, goalDeadline: '2026-10-07' }, 'daily')
    expect(plan.goal).toEqual({ quota: 1, daysLeft: 10, feasible: true })
  })
  test('mistakes and favorites sources pull from their books', async () => {
    await adapter.run("INSERT INTO mistake_book (word_id, mistake_count, last_mistake_at) VALUES (11, 2, '2026-09-27')")
    const fromMistakes = await backend.buildPlan({ dailyReviewLimit: 10 }, 'mistakes')
    expect(fromMistakes.words.map((w) => w.word)).toEqual(['ability'])
    const fromFavorites = await backend.buildPlan({ dailyReviewLimit: 10 }, 'favorites')
    expect(fromFavorites.words).toHaveLength(0)
  })
  test('test source returns up to 20 random words flagged as test', async () => {
    const plan = await backend.buildPlan({}, 'test')
    expect(plan.words).toHaveLength(3)
    expect(plan.words.every((w) => w.queue_type === 'test')).toBe(true)
  })
})
