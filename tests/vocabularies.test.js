import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const expected = { cet4: 2000, cet6: 2500, ielts: 3000, toefl: 3500 }

describe('bundled vocabularies', () => {
  Object.entries(expected).forEach(([name, count]) => {
    test(`${name} contains ${count} usable words`, () => {
      const words = JSON.parse(readFileSync(resolve('resources/vocabularies', `${name}.json`), 'utf8'))
      expect(words).toHaveLength(count)
      expect(new Set(words.map((item) => item.word.toLowerCase())).size).toBe(count)
      expect(words.every((item) => item.word && item.definition.length)).toBe(true)
    })
  })
})
