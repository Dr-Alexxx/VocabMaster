import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const root = resolve('open-vocabularies')
const catalog = JSON.parse(readFileSync(join(root, 'catalog.json'), 'utf8'))
const supportedFields = [
  'word',
  'phonetic',
  'definition',
  'examples',
  'etymology',
  'synonyms',
  'antonyms',
  'frequency',
]

describe('open vocabulary collection', () => {
  test('catalog summary and schema are internally consistent', () => {
    expect(catalog.schema).toEqual(supportedFields)
    expect(catalog.summary.vocabularies).toBe(catalog.vocabularies.length)
    expect(catalog.summary.words).toBe(
      catalog.vocabularies.reduce((total, vocabulary) => total + vocabulary.words, 0),
    )
  })

  test.each(catalog.vocabularies)('$name is import-ready', (vocabulary) => {
    const file = join(root, vocabulary.file)
    expect(existsSync(file)).toBe(true)

    const words = JSON.parse(readFileSync(file, 'utf8'))
    expect(words).toHaveLength(vocabulary.words)
    expect(new Set(words.map((item) => item.word.trim().toLocaleLowerCase('en-US'))).size).toBe(words.length)

    for (const item of words) {
      expect(Object.keys(item)).toEqual(supportedFields)
      expect(item.word.trim()).not.toBe('')
      expect(Array.isArray(item.definition)).toBe(true)
      expect(item.definition.some((definition) => String(definition).trim() !== '')).toBe(true)
      expect(Array.isArray(item.examples)).toBe(true)
      expect(Array.isArray(item.synonyms)).toBe(true)
      expect(Array.isArray(item.antonyms)).toBe(true)
      expect(Number.isInteger(item.frequency)).toBe(true)
      expect(item.frequency).toBeGreaterThanOrEqual(0)
    }
  })
})
