import { describe, expect, test } from 'vitest'
import { choiceShortcutIndex, spellingEnterAction, testGrade } from '../src/algorithms/study-interaction.js'

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

describe('test session grading', () => {
  test('grades by accuracy percentage', () => {
    expect(testGrade(18, 20)).toEqual({ percent: 90, grade: 'A', label: '优秀' })
    expect(testGrade(14, 20)).toEqual({ percent: 70, grade: 'B', label: '良好' })
    expect(testGrade(10, 20)).toEqual({ percent: 50, grade: 'C', label: '继续加油' })
  })

  test('handles empty and clamped sessions', () => {
    expect(testGrade(0, 0)).toEqual({ percent: 0, grade: 'C', label: '继续加油' })
    expect(testGrade(25, 20)).toEqual({ percent: 100, grade: 'A', label: '优秀' })
  })
})
