import { createRequire } from 'node:module'
import { describe, expect, test } from 'vitest'

const require = createRequire(import.meta.url)
const { headers, samples, createVocabularyTemplate } = require('../electron/vocabulary-template.cjs')

describe('vocabulary creator templates', () => {
  test('keeps the eight documented columns in a stable order', () => {
    expect(headers).toEqual(['word', 'phonetic', 'definition', 'examples', 'etymology', 'synonyms', 'antonyms', 'frequency'])
  })

  test('creates a UTF-8 BOM CSV template with sample rows', () => {
    const template = createVocabularyTemplate('csv')
    expect(template.content.startsWith('\uFEFFword,phonetic,definition')).toBe(true)
    expect(template.content).toContain('abandon')
    expect(template.content).toContain('desert|forsake')
  })

  test('creates JSON with array-valued multi-value fields', () => {
    const template = createVocabularyTemplate('json')
    const words = JSON.parse(template.content)
    expect(words).toHaveLength(samples.length)
    expect(words[0].definition).toEqual(['v. 放弃；遗弃', 'n. 放任；放纵'])
    expect(words[0].frequency).toBe(9500)
  })

  test('provides tabular data for the Excel writer', () => {
    const template = createVocabularyTemplate('xlsx')
    expect(template.headers).toEqual(headers)
    expect(template.rows).toHaveLength(2)
    expect(template.rows[0]).toHaveLength(headers.length)
  })
})
