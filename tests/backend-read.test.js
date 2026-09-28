// tests/backend-read.test.js
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, test } from 'vitest'
const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite')
const { createAdapter } = require('../src/backend/db-adapter.cjs')
const { schema } = require('../src/backend/schema.cjs')
const { createBackend } = require('../src/backend/service.cjs')
const { addLocalDays } = require('../src/backend/date-utils.cjs')

function seeded() {
  const adapter = createAdapter(new DatabaseSync(':memory:'))
  return adapter
}
let backend, adapter
beforeEach(async () => {
  adapter = createAdapter(new DatabaseSync(':memory:'))
  await adapter.exec(schema)
  await adapter.run("INSERT INTO vocabularies (id, name, type, is_default, is_active) VALUES (1, 'CET-4 核心词汇', 'CET4', 1, 1)")
  await adapter.run("INSERT INTO words (id, vocabulary_id, word, definition) VALUES (10, 1, 'abandon', '[\"v. 放弃\"]')")
  backend = createBackend(adapter, { todayKey: () => '2026-09-28', addDaysFrom: (amount) => addLocalDays(new Date(2026, 8, 28), amount) })
})

describe('read-only backend', () => {
  test('reports dashboard counters', async () => {
    const dash = await backend.getDashboard()
    expect(dash.newCount).toBe(1)
    expect(dash.due).toBe(0)
  })
  test('lists vocabularies with progress', async () => {
    const rows = await backend.listVocabularies()
    expect(rows[0]).toMatchObject({ name: 'CET-4 核心词汇', total: 1, learned: 0 })
  })
  test('searches words by word and definition', async () => {
    expect(await backend.searchWords('abandon')).toHaveLength(1)
    expect(await backend.searchWords('放弃')).toHaveLength(1)
    expect(await backend.searchWords('')).toHaveLength(0)
  })
  test('gets one word with study stats', async () => {
    const word = await backend.getWord(10)
    expect(word.word).toBe('abandon')
    expect(word.study_count).toBe(0)
  })
  test('lists favorites and mistakes', async () => {
    await adapter.run("UPDATE words SET is_favorited = 1 WHERE id = 10")
    expect(await backend.listFavorites()).toHaveLength(1)
    expect(await backend.listMistakes(false)).toHaveLength(0)
  })
  test('aggregates statistics', async () => {
    const stats = await backend.getStatistics(30)
    expect(stats.vocabularies).toHaveLength(1)
    expect(stats.totals.total).toBe(0)
  })
})
