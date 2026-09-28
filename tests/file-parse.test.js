import { createRequire } from 'node:module'
import { expect, test } from 'vitest'

const require = createRequire(import.meta.url)
const { parseVocabularyFile } = require('../src/backend/file-parse.cjs')
const XLSX = require('xlsx')

test('parses json arrays and {words} objects', () => {
  const bytes = new TextEncoder().encode(JSON.stringify([{ word: 'a', definition: 'x' }]))
  const parsed = parseVocabularyFile(bytes, 'a.json')
  expect(parsed.headers).toContain('word')
  expect(parsed.rows).toHaveLength(1)
})
test('falls back to gb18030 when utf-8 is garbled', () => {
  const bytes = Uint8Array.from(Buffer.from('776f72642c646566696e6974696f6e0a6162616e646f6e2cb7c5c6fa', 'hex'))
  const parsed = parseVocabularyFile(bytes, 'a.csv')
  expect(parsed.rows[0][1]).toBe('放弃')
})
test('reads csv headers and skips blank rows', () => {
  const bytes = new TextEncoder().encode('word,definition\nabandon,v. 放弃\n,\n')
  const parsed = parseVocabularyFile(bytes, 'a.csv')
  expect(parsed.rows).toHaveLength(1)
})

test('parses {words} object wrappers', () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ words: [{ word: 'a', definition: 'x' }] }))
  const parsed = parseVocabularyFile(bytes, 'a.json')
  expect(parsed.headers).toContain('word')
  expect(parsed.rows).toEqual([['a', 'x']])
})

test('strips the utf-8 BOM before parsing', () => {
  const bytes = new TextEncoder().encode('\uFEFF' + JSON.stringify([{ word: 'a', definition: 'x' }]))
  const parsed = parseVocabularyFile(bytes, 'a.json')
  expect(parsed.rows).toHaveLength(1)
})

test('parses xlsx workbook bytes', () => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['word', 'definition'], ['abandon', 'v. 放弃']]), 'Sheet1')
  const out = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
  const parsed = parseVocabularyFile(new Uint8Array(out), 'a.xlsx')
  expect(parsed.headers).toEqual(['word', 'definition'])
  expect(parsed.rows).toEqual([['abandon', 'v. 放弃']])
})

test('treats txt files as csv', () => {
  const bytes = new TextEncoder().encode('word,definition\nabandon,放弃')
  const parsed = parseVocabularyFile(bytes, 'a.txt')
  expect(parsed.rows[0][1]).toBe('放弃')
})

test('rejects json without an array payload', () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ foo: 1 }))
  expect(() => parseVocabularyFile(bytes, 'a.json')).toThrow(/words/)
})

test('rejects data without importable rows', () => {
  const bytes = new TextEncoder().encode(',\n')
  expect(() => parseVocabularyFile(bytes, 'a.csv')).toThrow(/没有可导入的数据/)
})

test('generates column names when the first row is not a header', () => {
  const bytes = new TextEncoder().encode('apple,fruit\nbanana,fruit')
  const parsed = parseVocabularyFile(bytes, 'a.csv')
  expect(parsed.headers).toEqual(['第 1 列', '第 2 列'])
  expect(parsed.rows).toHaveLength(2)
})
