import { describe, expect, it } from 'vitest'
import { catalog, pointsById, pointsForVolume } from '../src/lib/data'
import { addDays, availableStars, buyBamboo, clearMistake, feedPet, freshState, getBadges, isDue, mistakePoints, pointStage, recommendation, recordAuto, recordSelf, validateState } from '../src/lib/progress'

describe('knowledge catalog', () => {
  it('has a playable task for every merged knowledge point', () => {
    expect(catalog.points).toHaveLength(662)
    expect(new Set(catalog.points.map((point) => point.id)).size).toBe(662)
    for (const point of catalog.points) {
      expect(point.task.instruction.length).toBeGreaterThan(0)
      if (point.task.mode === 'auto') {
        expect(point.task.variants).toHaveLength(3)
        expect(point.task.variants.every((variant) => variant.hint && variant.explanation && variant.audio)).toBe(true)
      } else {
        expect(point.task.checklist.length).toBeGreaterThanOrEqual(2)
        expect(point.task.audio).toBeTruthy()
      }
    }
    expect(pointsForVolume('YW1')[0].id).toBe('YW1-U0-L1-KP01')
    expect(pointsForVolume('SX2')[0].id).toBe('SX2-U1-L1-KP01')
    expect(catalog.volumes.every((volume) => pointsForVolume(volume.id).length === catalog.points.filter((point) => point.volumeId === volume.id).length)).toBe(true)
  })

  it('keeps whole-word reading and oral word-building as self-assessment', () => {
    const firstGrade = pointsById.get('YW1-U1-L1-KP01')!
    const secondGrade = pointsById.get('YW2-U1-L1-KP01')!
    expect(firstGrade.task.mode).toBe('self')
    expect(secondGrade.task.mode).toBe('self')
    if (firstGrade.task.mode === 'self' && secondGrade.task.mode === 'self') {
      expect(firstGrade.task.practice).toContain('天、地、人、你、我、他')
      expect(secondGrade.task.practice).toContain('蝌、蚪、脑、袋')
      expect(secondGrade.task.practice).toContain('蹲、肚、鼓')
    }
  })
})

describe('progress', () => {
  const id = 'SX1-U1-L7-KP03'
  const point = pointsById.get(id)!
  it('requires three successful sessions on scheduled different dates', () => {
    let state = freshState()
    state = recordAuto(state, id, true, '2026-09-01')
    expect(state.records[id].correctDays).toEqual(['2026-09-01'])
    expect(state.records[id].nextDue).toBe('2026-09-02')
    expect(isDue(point, state, '2026-09-01')).toBe(false)
    state = recordAuto(state, id, true, '2026-09-01')
    expect(state.records[id].correctDays).toHaveLength(1)
    state = recordAuto(state, id, true, '2026-09-02')
    expect(state.records[id].nextDue).toBe('2026-09-05')
    state = recordAuto(state, id, true, '2026-09-03')
    expect(state.records[id].correctDays).toHaveLength(2)
    state = recordAuto(state, id, true, '2026-09-05')
    expect(pointStage(point, state)).toBe('mastered')
    expect(isDue(point, state, '2026-09-10')).toBe(false)
    expect(state.records[id].stars).toBe(4)
  })

  it('gives hints and review without promoting an incorrect answer', () => {
    let state = recordAuto(freshState(), id, true, '2026-09-01')
    state = recordAuto(state, id, false, '2026-09-01')
    expect(state.records[id].correctDays).toHaveLength(1)
    expect(state.records[id].nextDue).toBe('2026-09-02')
    expect(state.records[id].wrongCount).toBe(1)
  })

  it('keeps self-assessment separate from automatic mastery', () => {
    const selfId = 'YW1-U0-L1-KP01'
    let state = recordSelf(freshState(), selfId, 'practiced', '2026-09-01')
    expect(pointStage(pointsById.get(selfId)!, state)).toBe('practiced')
    state = recordSelf(state, selfId, 'confident', '2026-09-02')
    expect(pointStage(pointsById.get(selfId)!, state)).toBe('confident')
    expect(state.records[selfId].nextDue).toBe('2026-09-05')
  })

  it('uses cross-grade anchors in a fresh second-grade route', () => {
    const state = { ...freshState(), activeVolume: 'SX2' as const }
    const picks = recommendation(state, 'SX2', '2026-09-01')
    expect(picks).toHaveLength(5)
    expect(picks.some((point) => point.volumeId === 'SX1')).toBe(true)
  })

  it('rejects an invalid imported progress file', () => {
    expect(validateState({ version: 1, activeVolume: 'YW1', muted: false, records: { FAKE: {} } })).toBeNull()
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('round-trips a local progress backup', () => {
    const original = recordSelf(freshState(), 'YW1-U0-L1-KP01', 'confident', '2026-09-27')
    expect(validateState(JSON.parse(JSON.stringify(original)))).toEqual(original)
  })

  it('adds a speech star bonus once per day without turning it into mastery', () => {
    const selfId = 'YW1-U0-L1-KP01'
    let state = recordSelf(freshState(), selfId, 'practiced', '2026-09-01', 3)
    state = recordSelf(state, selfId, 'practiced', '2026-09-01', 2)
    expect(state.records[selfId].stars).toBe(3)
    expect(state.records[selfId].starDays).toEqual(['2026-09-01'])
    expect(pointStage(pointsById.get(selfId)!, state)).toBe('practiced')
    state = recordSelf(state, selfId, 'confident', '2026-09-02', 2)
    expect(state.records[selfId].stars).toBe(5)
    expect(validateState(JSON.parse(JSON.stringify(state)))).toEqual(state)
  })

  it('spends available stars on bamboo and grows the companion without decay', () => {
    let state = freshState()
    const selfId = 'YW1-U0-L1-KP01'
    state = recordSelf(state, selfId, 'practiced', '2026-09-01', 3)
    state = recordSelf(state, selfId, 'practiced', '2026-09-02', 3)
    expect(availableStars(state)).toBe(6)
    state = buyBamboo(state, 3)
    expect(availableStars(state)).toBe(1)
    expect(state.pet?.bamboo).toBe(5)
    for (let index = 0; index < 4; index++) state = feedPet(state).state
    expect(state.pet?.level).toBe(2)
    expect(state.pet?.fedCount).toBe(4)
    expect(state.pet?.bamboo).toBe(1)
  })

  it('imports older version-one backups with default companion fields', () => {
    const state = recordAuto(freshState(), id, true, '2026-09-01')
    const oldRecord = { ...state.records[id] }
    delete oldRecord.starAwardsByDay
    const migrated = validateState({ version: 1, activeVolume: 'YW1', muted: false, records: { [id]: oldRecord } })
    expect(migrated?.pet?.bamboo).toBe(2)
    expect(migrated?.spentStars).toBe(0)
    expect(migrated?.records[id].starAwardsByDay).toEqual({ '2026-09-01': 1 })
  })

  it('tracks mistakes and allows clearing them', () => {
    let state = freshState()
    expect(mistakePoints(state)).toHaveLength(0)
    state = recordAuto(state, id, false, '2026-09-01')
    expect(mistakePoints(state)).toHaveLength(1)
    expect(mistakePoints(state)[0].id).toBe(id)

    state = clearMistake(state, id)
    expect(mistakePoints(state)).toHaveLength(0)
  })

  it('computes badges based on progress milestones', () => {
    let state = freshState()
    const initialBadges = getBadges(state)
    expect(initialBadges.every((b) => !b.unlocked)).toBe(true)

    state = recordAuto(state, id, true, '2026-09-01')
    const updatedBadges = getBadges(state)
    const firstStarBadge = updatedBadges.find((b) => b.id === 'first-star')
    expect(firstStarBadge?.unlocked).toBe(true)
  })
})
