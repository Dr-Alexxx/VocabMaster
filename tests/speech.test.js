import { describe, expect, test } from 'vitest'
import { pickVoice } from '../src/algorithms/speech.js'

const voices = [
  { name: 'Microsoft Zira', lang: 'en-US' },
  { name: 'Microsoft Sonia', lang: 'en-GB' },
  { name: 'Microsoft Kangkang', lang: 'zh-CN' }
]

describe('speech voice selection', () => {
  test('uses the system default voice for the system accent', () => {
    expect(pickVoice(voices, 'system')).toBe(null)
  })

  test('picks the matching accent voice', () => {
    expect(pickVoice(voices, 'us')?.name).toBe('Microsoft Zira')
    expect(pickVoice(voices, 'uk')?.name).toBe('Microsoft Sonia')
  })

  test('falls back to any voice with the same base language', () => {
    const onlyBase = [{ name: 'Generic English', lang: 'en' }, { name: '中文', lang: 'zh-CN' }]
    expect(pickVoice(onlyBase, 'uk')?.name).toBe('Generic English')
  })

  test('returns null when nothing matches or the list is empty', () => {
    expect(pickVoice([], 'us')).toBe(null)
    expect(pickVoice([{ name: '中文', lang: 'zh-CN' }], 'us')).toBe(null)
    expect(pickVoice(undefined, 'us')).toBe(null)
  })
})
