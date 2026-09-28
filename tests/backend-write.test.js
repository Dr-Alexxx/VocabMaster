// tests/backend-write.test.js
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, test } from 'vitest'
const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite')
const { createAdapter } = require('../src/backend/db-adapter.cjs')
const { schema } = require('../src/backend/schema.cjs')
const { createBackend } = require('../src/backend/service.cjs')
const { addLocalDays } = require('../src/backend/date-utils.cjs')

let backend, adapter
beforeEach(async () => {
  adapter = createAdapter(new DatabaseSync(':memory:'))
  await adapter.exec(schema)
  await adapter.run("INSERT INTO vocabularies (id, name, type, is_default, is_active) VALUES (1, 'CET-4 核心词汇', 'CET4', 1, 1)")
  await adapter.run("INSERT INTO words (id, vocabulary_id, word, definition) VALUES (10, 1, 'abandon', '[\"v. 放弃\"]')")
  backend = createBackend(adapter, { todayKey: () => '2026-09-28', addDaysFrom: (amount) => addLocalDays(new Date(2026, 8, 28), amount) })
})

describe('write backend', () => {
  test('submitAnswer schedules review and records history atomically', async () => {
    const record = await backend.submitAnswer({ wordId: 10, quality: 5, mode: 'spelling', timeSpent: 8, options: {} })
    expect(record.repetitions).toBe(1)
    expect(record.status).toBe('learning')
    expect(record.next_review_date).toBe('2026-09-29') // todayKey 2026-09-28 + interval 1
    const stats = await backend.getStatistics(30)
    expect(stats.totals.total).toBe(1)
  })
  test('low quality adds to mistake book with frequent flag after 3', async () => {
    for (let i = 0; i < 3; i += 1) await backend.submitAnswer({ wordId: 10, quality: 0, mode: 'choice', timeSpent: 3, options: {} })
    const [item] = await backend.listMistakes(true)
    expect(item.mistake_count).toBe(3)
    expect(item.is_frequent).toBe(true)
  })
  test('deleteVocabulary refuses default packs and cascades', async () => {
    await expect(backend.deleteVocabulary(1)).rejects.toThrow('系统默认词库不能删除')
    await adapter.run("INSERT INTO vocabularies (id, name, type, is_default, is_active) VALUES (2, 'Custom Pack', 'CUSTOM', 0, 1)")
    await adapter.run("INSERT INTO words (id, vocabulary_id, word, definition) VALUES (20, 2, 'custom-word', '[\"n. custom\"]')")
    await adapter.run("INSERT INTO words (id, vocabulary_id, word, definition) VALUES (21, 2, 'custom-word-2', '[\"n. custom two\"]')")
    await backend.submitAnswer({ wordId: 20, quality: 0, mode: 'choice', timeSpent: 1, options: {} })
    expect((await adapter.get('SELECT COUNT(*) count FROM mistake_book WHERE word_id = 20')).count).toBe(1)
    expect(await backend.deleteVocabulary(2)).toBe(true)
    expect((await adapter.get('SELECT COUNT(*) count FROM vocabularies WHERE id = 2')).count).toBe(0)
    expect((await adapter.get('SELECT COUNT(*) count FROM words WHERE vocabulary_id = 2')).count).toBe(0)
    expect((await adapter.get('SELECT COUNT(*) count FROM learning_records WHERE word_id = 20')).count).toBe(0)
    expect((await adapter.get('SELECT COUNT(*) count FROM study_history WHERE word_id = 20')).count).toBe(0)
    expect((await adapter.get('SELECT COUNT(*) count FROM mistake_book WHERE word_id = 20')).count).toBe(0)
    expect((await adapter.get('SELECT COUNT(*) count FROM words WHERE id = 10')).count).toBe(1)
  })
  test('resetProgress keeps words and favorites', async () => {
    await backend.submitAnswer({ wordId: 10, quality: 4, mode: 'flashcard', timeSpent: 2, options: {} })
    await backend.updateWord(10, { is_favorited: true, notes: 'n' })
    await backend.resetProgress()
    expect((await backend.getWord(10)).is_favorited).toBe(true)
    expect((await backend.getDashboard()).learned).toBe(0)
  })
  test('settings round-trip', async () => {
    await backend.setSettings({ theme: 'dark' })
    expect(await backend.getSettings()).toEqual({ theme: 'dark' })
  })
})
