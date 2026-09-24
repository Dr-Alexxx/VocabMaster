import { describe, expect, test } from 'vitest'
import { choiceShortcutIndex, spellingEnterAction } from '../src/algorithms/study-interaction.js'

describe('study keyboard interactions', () => {
  test('submits a non-empty spelling answer on the first Enter', () => {
    expect(spellingEnterAction({ hasAnswer: true, hasFeedback: false, feedbackRecorded: false, submitting: false })).toBe('submit')
  })

  test('advances after the spelling result has been recorded', () => {
    expect(spellingEnterAction({ hasAnswer: true, hasFeedback: true, feedbackRecorded: true, submitting: false })).toBe('next')
  })

  test('waits for empty answers and in-flight persistence', () => {
    expect(spellingEnterAction({ hasAnswer: false, hasFeedback: false, feedbackRecorded: false, submitting: false })).toBe('wait')
    expect(spellingEnterAction({ hasAnswer: true, hasFeedback: true, feedbackRecorded: false, submitting: true })).toBe('wait')
  })

  test('maps both letters and digits to choice indices', () => {
    expect(choiceShortcutIndex('A')).toBe(0)
    expect(choiceShortcutIndex('d')).toBe(3)
    expect(choiceShortcutIndex('1')).toBe(0)
    expect(choiceShortcutIndex('4')).toBe(3)
    expect(choiceShortcutIndex('Enter')).toBe(-1)
  })
})
