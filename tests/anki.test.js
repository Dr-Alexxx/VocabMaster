import { describe, expect, test } from 'vitest'
import { calculateQuality, levenshteinDistance, spellingFeedback, updateCard } from '../src/algorithms/anki.js'

describe('SM-2 review scheduling', () => {
  test('resets a failed card to a one-day interval', () => {
    const result = updateCard({ easiness_factor: 2.5, interval: 12, repetitions: 4 }, 2)
    expect(result.interval).toBe(1)
    expect(result.repetitions).toBe(0)
    expect(result.status).toBe('learning')
  })

  test('uses the first and second successful intervals', () => {
    expect(updateCard({ easiness_factor: 2.5, interval: 0, repetitions: 0 }, 4).interval).toBe(1)
    expect(updateCard({ easiness_factor: 2.5, interval: 1, repetitions: 1 }, 4).interval).toBe(6)
  })

  test('marks a mature card as mastered', () => {
    const result = updateCard({ easiness_factor: 2.5, interval: 15, repetitions: 4 }, 5)
    expect(result.repetitions).toBe(5)
    expect(result.interval).toBeGreaterThanOrEqual(21)
    expect(result.status).toBe('mastered')
  })
})

describe('automatic answer quality', () => {
  test('calculates edit distance case-insensitively', () => {
    expect(levenshteinDistance('Ability', 'ability')).toBe(0)
    expect(levenshteinDistance('receive', 'recieve')).toBe(2)
  })

  test('scores spelling and timed choices', () => {
    expect(calculateQuality('spelling', 'ability', 'ability')).toBe(5)
    expect(calculateQuality('spelling', 'abilty', 'ability')).toBe(3)
    expect(calculateQuality('spelling', '', 'ability')).toBe(0)
    expect(calculateQuality('choice', 'correct', 'correct', 2000)).toBe(5)
    expect(calculateQuality('choice', 'correct', 'correct', 5000)).toBe(4)
    expect(calculateQuality('choice', 'wrong', 'correct', 1000)).toBe(0)
  })
})

describe('spelling feedback tiers', () => {
  test('flags an exact match', () => {
    expect(spellingFeedback('ability', 'ability')).toEqual({ tier: 'exact', quality: 5, distance: 0 })
  })

  test('flags near misses within two edits as close', () => {
    expect(spellingFeedback('abilty', 'ability')).toEqual({ tier: 'close', quality: 3, distance: 1 })
    expect(spellingFeedback('Abilty', 'ability')).toEqual({ tier: 'close', quality: 3, distance: 1 })
  })

  test('flags distant answers as wrong with low quality', () => {
    const result = spellingFeedback('banana', 'ability')
    expect(result.tier).toBe('wrong')
    expect(result.quality).toBeLessThanOrEqual(1)
  })

  test('flags empty answers as empty', () => {
    expect(spellingFeedback('', 'ability')).toEqual({ tier: 'empty', quality: 0, distance: 7 })
    expect(spellingFeedback('   ', 'ability')).toEqual({ tier: 'empty', quality: 0, distance: 7 })
  })
})
