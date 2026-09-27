import { describe, expect, it } from 'vitest'
import { extractSpokenTarget, formatSpokenScript, speechMatchScore, starsForSpeechScore } from '../src/lib/aiExperience'

describe('AI learning experience helpers', () => {
  it('reads arithmetic symbols aloud as ordinary Chinese', () => {
    expect(formatSpokenScript('5 - 2 = ?')).toBe('5减2 等于 几')
    expect(formatSpokenScript('□ + 3 = 8')).toBe('方框 加 3 等于 8')
    expect(formatSpokenScript('6×2=12')).toBe('6乘2等于12')
  })

  it('extracts the original short practice sentence from instructions', () => {
    expect(extractSpokenTarget('原创朗读小句：“我住在中国。这里有高山，也有大海。”指着字读两遍。'))
      .toBe('我住在中国。这里有高山，也有大海。')
  })

  it('scores text match in order and ignores punctuation', () => {
    expect(speechMatchScore('天、地、人，你、我、他。', '天地人你我他')).toBe(100)
    expect(speechMatchScore('天 地 人', '人 地 天')).toBeLessThan(100)
    expect(speechMatchScore('天地人', '')).toBe(0)
  })

  it('maps an approximate match score to a small effort-star bonus', () => {
    expect(starsForSpeechScore(95)).toBe(3)
    expect(starsForSpeechScore(80)).toBe(2)
    expect(starsForSpeechScore(65)).toBe(1)
    expect(starsForSpeechScore(59)).toBe(0)
  })
})
