// tests/seed.test.js
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, test } from 'vitest'
const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite')
const { createAdapter } = require('../src/backend/db-adapter.cjs')
const { schema } = require('../src/backend/schema.cjs')
const { ensureSeeded } = require('../src/backend/seed.cjs')

describe('seed default vocabularies', () => {
  let adapter

  beforeEach(async () => {
    adapter = createAdapter(new DatabaseSync(':memory:'))
    await adapter.exec(schema)
  })

  test('seeds default packs once', async () => {
    const loadJson = async () => [{ word: 'a', definition: ['x'] }]
    const first = await ensureSeeded(adapter, loadJson)
    expect(first).toMatchObject({ seeded: true, words: 4 })
    const second = await ensureSeeded(adapter, loadJson)
    expect(second.seeded).toBe(false)
    expect(await adapter.all('SELECT * FROM words')).toHaveLength(4)
  })

  test('seeds pack metadata and maps word fields', async () => {
    const loadJson = async (name) => (name === 'cet4.json'
      ? [
          { word: 'state', phonetic: 'steit', definition: ['n. 状态'], examples: ['example'], etymology: 'latin', synonyms: ['status'], antonyms: [], frequency: 137 },
          { word: 'single', definition: '单一的' }
        ]
      : [])
    const result = await ensureSeeded(adapter, loadJson)
    expect(result).toMatchObject({ seeded: true, words: 2 })
    expect(await adapter.all('SELECT name, type, description, is_default, is_active FROM vocabularies ORDER BY id')).toEqual([
      { name: 'CET-4 核心词汇', type: 'CET4', description: '大学英语四级核心词汇', is_default: 1, is_active: 1 },
      { name: 'CET-6 核心词汇', type: 'CET6', description: '大学英语六级进阶词汇', is_default: 1, is_active: 0 },
      { name: 'IELTS 核心词汇', type: 'IELTS', description: '雅思学术与生活场景高频词汇', is_default: 1, is_active: 0 },
      { name: 'TOEFL 核心词汇', type: 'TOEFL', description: '托福学术英语高频词汇', is_default: 1, is_active: 0 }
    ])
    const rows = await adapter.all('SELECT * FROM words ORDER BY id')
    expect(rows).toHaveLength(2)
    expect(rows[0].word).toBe('state')
    expect(rows[0].phonetic).toBe('steit')
    expect(JSON.parse(rows[0].definition)).toEqual(['n. 状态'])
    expect(JSON.parse(rows[0].examples)).toEqual(['example'])
    expect(JSON.parse(rows[0].synonyms)).toEqual(['status'])
    expect(JSON.parse(rows[0].antonyms)).toEqual([])
    expect(rows[0].etymology).toBe('latin')
    expect(rows[0].frequency).toBe(137)
    expect(JSON.parse(rows[1].definition)).toEqual(['单一的'])
  })
})
