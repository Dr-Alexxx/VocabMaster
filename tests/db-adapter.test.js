// tests/db-adapter.test.js
import { createRequire } from 'node:module'
import { describe, expect, test } from 'vitest'
const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite')
const { createAdapter } = require('../src/backend/db-adapter.cjs')
const { schema } = require('../src/backend/schema.cjs')

describe('db adapter common subset', () => {
  test('runs, gets and alls with positional params', async () => {
    const adapter = createAdapter(new DatabaseSync(':memory:'))
    await adapter.exec(schema)
    const inserted = await adapter.run("INSERT INTO vocabularies (name, type) VALUES (?, ?)", ['A', 'CET4'])
    expect(inserted.changes).toBe(1)
    expect(Number.isInteger(inserted.lastInsertRowid)).toBe(true)
    expect((await adapter.get('SELECT name FROM vocabularies WHERE id = ?', [inserted.lastInsertRowid])).name).toBe('A')
    expect(await adapter.all('SELECT * FROM vocabularies')).toHaveLength(1)
  })

  test('rolls back a failed transaction', async () => {
    const adapter = createAdapter(new DatabaseSync(':memory:'))
    await adapter.exec(schema)
    await expect(adapter.withTransaction(async () => {
      await adapter.run("INSERT INTO vocabularies (name, type) VALUES ('B', 'CET4')")
      throw new Error('boom')
    })).rejects.toThrow('boom')
    expect(await adapter.all('SELECT * FROM vocabularies')).toHaveLength(0)
  })
})
