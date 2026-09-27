import { catalog, pointsById, pointsForVolume } from './data'
import type { Badge, GameState, Point, ProgressRecord, VolumeId } from '../types'

const KEY = 'knowledge-islands-progress-v1'

export function todayKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(day: string, count: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d + count, 12)
  return todayKey(date)
}

export function freshState(): GameState {
  return {
    version: 1,
    activeVolume: 'YW1',
    muted: false,
    records: {},
    spentStars: 0,
    pet: { level: 1, experience: 0, bamboo: 2, fedCount: 0 },
  }
}

export function validateState(value: unknown): GameState | null {
  if (!value || typeof value !== 'object') return null
  const state = value as Partial<GameState>
  if (state.version !== 1 || !catalog.volumes.some((volume) => volume.id === state.activeVolume) || typeof state.muted !== 'boolean' || !state.records || typeof state.records !== 'object' || Array.isArray(state.records)) return null
  const records: Record<string, ProgressRecord> = {}
  for (const [id, raw] of Object.entries(state.records)) {
    if (!pointsById.has(id) || !raw || typeof raw !== 'object') return null
    const record = raw as ProgressRecord
    if (!Array.isArray(record.correctDays) || !Array.isArray(record.selfDays) || !Array.isArray(record.starDays) || !Number.isInteger(record.lastVariant) || !Number.isInteger(record.wrongCount) || !Number.isInteger(record.stars)) return null
    if (![...record.correctDays, ...record.selfDays, ...record.starDays].every((day) => /^\d{4}-\d{2}-\d{2}$/.test(day))) return null
    if ([record.correctDays, record.selfDays, record.starDays].some((days) => new Set(days).size !== days.length)) return null
    if (record.lastVariant < 0 || record.wrongCount < 0 || record.stars < record.starDays.length || record.correctDays.length > 3) return null
    if (record.nextDue && !/^\d{4}-\d{2}-\d{2}$/.test(record.nextDue)) return null
    if (record.lastAttemptDay && !/^\d{4}-\d{2}-\d{2}$/.test(record.lastAttemptDay)) return null
    if (record.selfRating && !['practiced', 'confident'].includes(record.selfRating)) return null
    if (pointsById.get(id)?.task.mode === 'auto' && (record.selfDays.length || record.selfRating)) return null
    if (pointsById.get(id)?.task.mode === 'self' && record.correctDays.length) return null
    const awardMap = record.starAwardsByDay && typeof record.starAwardsByDay === 'object' && !Array.isArray(record.starAwardsByDay)
      ? record.starAwardsByDay
      : Object.fromEntries(record.starDays.map((day) => [day, 1]))
    if (Object.keys(awardMap).some((day) => !/^\d{4}-\d{2}-\d{2}$/.test(day) || !record.starDays.includes(day))) return null
    if (record.starDays.some((day) => !Number.isInteger(awardMap[day]) || awardMap[day] < 1 || awardMap[day] > 3)) return null
    if (Object.values(awardMap).reduce((sum, count) => sum + count, 0) !== record.stars) return null
    records[id] = { ...record, starAwardsByDay: awardMap }
  }
  const earnedStars = Object.values(records).reduce((sum, record) => sum + record.stars, 0)
  const spentStars = Number.isInteger(state.spentStars) && (state.spentStars ?? 0) >= 0 && (state.spentStars ?? 0) <= earnedStars
    ? state.spentStars ?? 0
    : 0
  const rawPet = state.pet
  const pet = rawPet && typeof rawPet === 'object' ? {
    level: Number.isInteger(rawPet.level) && rawPet.level >= 1 ? rawPet.level : 1,
    experience: Number.isInteger(rawPet.experience) && rawPet.experience >= 0 && rawPet.experience < 100 ? rawPet.experience : 0,
    bamboo: Number.isInteger(rawPet.bamboo) && rawPet.bamboo >= 0 ? rawPet.bamboo : 2,
    fedCount: Number.isInteger(rawPet.fedCount) && rawPet.fedCount >= 0 ? rawPet.fedCount : 0,
  } : { level: 1, experience: 0, bamboo: 2, fedCount: 0 }
  return { version: 1, activeVolume: state.activeVolume as VolumeId, muted: state.muted, records, spentStars, pet }
}

export function loadState(): GameState {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? validateState(JSON.parse(raw)) ?? freshState() : freshState()
  } catch {
    return freshState()
  }
}

export function saveState(state: GameState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

function emptyRecord(): ProgressRecord {
  return { correctDays: [], selfDays: [], lastVariant: 0, wrongCount: 0, stars: 0, starDays: [], starAwardsByDay: {} }
}

function awardStar(record: ProgressRecord, day: string, count = 1): void {
  const awards = { ...(record.starAwardsByDay ?? Object.fromEntries(record.starDays.map((earnedDay) => [earnedDay, 1]))) }
  const previous = awards[day] ?? 0
  const next = Math.max(previous, Math.max(1, Math.min(3, Math.floor(count))))
  if (!record.starDays.includes(day)) {
    record.starDays.push(day)
  }
  record.stars += next - previous
  awards[day] = next
  record.starAwardsByDay = awards
}

export function recordAuto(state: GameState, id: string, correct: boolean, day = todayKey()): GameState {
  const point = pointsById.get(id)
  if (!point || point.task.mode !== 'auto') return state
  const records = { ...state.records }
  const record = { ...(records[id] ?? emptyRecord()) }
  record.correctDays = [...record.correctDays]
  record.starDays = [...record.starDays]
  record.starAwardsByDay = { ...(record.starAwardsByDay ?? {}) }
  awardStar(record, day)
  record.lastAttemptDay = day
  if (correct) {
    if (!record.correctDays.includes(day) && (!record.nextDue || day >= record.nextDue) && record.correctDays.length < 3) {
      record.correctDays.push(day)
      record.nextDue = record.correctDays.length === 1 ? addDays(day, 1) : record.correctDays.length === 2 ? addDays(day, 3) : undefined
      record.lastVariant = record.correctDays.length % point.task.variants.length
    }
  } else {
    record.wrongCount += 1
    if (!record.nextDue || record.nextDue < day) record.nextDue = day
  }
  records[id] = record
  return { ...state, records }
}

export function recordSelf(state: GameState, id: string, rating: 'practiced' | 'confident', day = todayKey(), earnedStars = 1): GameState {
  const point = pointsById.get(id)
  if (!point || point.task.mode !== 'self') return state
  const records = { ...state.records }
  const record = { ...(records[id] ?? emptyRecord()) }
  record.selfDays = [...record.selfDays]
  record.starDays = [...record.starDays]
  record.starAwardsByDay = { ...(record.starAwardsByDay ?? {}) }
  if (!record.selfDays.includes(day)) record.selfDays.push(day)
  awardStar(record, day, earnedStars)
  record.selfRating = rating
  record.lastAttemptDay = day
  record.nextDue = addDays(day, rating === 'confident' ? 3 : 1)
  records[id] = record
  return { ...state, records }
}

export function pointStage(point: Point, state: GameState): 'new' | 'practiced' | 'confident' | 'mastered' {
  const record = state.records[point.id]
  if (!record) return 'new'
  if (point.task.mode === 'auto') return record.correctDays.length >= 3 ? 'mastered' : 'practiced'
  return record.selfRating === 'confident' ? 'confident' : 'practiced'
}

export function isDue(point: Point, state: GameState, day = todayKey()): boolean {
  const record = state.records[point.id]
  return !!record?.nextDue && record.nextDue <= day && pointStage(point, state) !== 'mastered'
}

export function recommendation(state: GameState, volumeId: VolumeId = state.activeVolume, day = todayKey(), count = 5): Point[] {
  const volumePoints = pointsForVolume(volumeId)
  const selected: Point[] = []
  const add = (point?: Point) => {
    if (point && !selected.some((item) => item.id === point.id) && selected.length < count) selected.push(point)
  }
  volumePoints.filter((point) => isDue(point, state, day)).forEach(add)
  for (const point of volumePoints) {
    if (selected.length >= count) break
    if (pointStage(point, state) !== 'new') continue
    const weak = (candidate: Point) => {
      const stage = pointStage(candidate, state)
      return stage === 'new' || stage === 'practiced' && isDue(candidate, state, day)
    }
    point.prereq.map((id) => pointsById.get(id)).filter((p): p is Point => !!p && weak(p)).forEach(add)
    catalog.crossGradeLinks.filter((link) => link.toId === point.id).map((link) => pointsById.get(link.fromId)).filter((p): p is Point => !!p && weak(p)).forEach(add)
    add(point)
  }
  if (selected.length < count) volumePoints.filter((point) => pointStage(point, state) !== 'mastered').forEach(add)
  return selected.slice(0, count)
}

export function volumeStats(state: GameState, volumeId: VolumeId) {
  const points = pointsForVolume(volumeId)
  return {
    total: points.length,
    practiced: points.filter((point) => pointStage(point, state) !== 'new').length,
    mastered: points.filter((point) => pointStage(point, state) === 'mastered').length,
    confident: points.filter((point) => pointStage(point, state) === 'confident').length,
    due: points.filter((point) => isDue(point, state)).length,
  }
}

export function totalStars(state: GameState): number {
  return Object.values(state.records).reduce((sum, record) => sum + record.stars, 0)
}

export function availableStars(state: GameState): number {
  return Math.max(0, totalStars(state) - (state.spentStars ?? 0))
}

export function buyBamboo(state: GameState, count: 1 | 3): GameState {
  const cost = count === 3 ? 5 : 2
  if (availableStars(state) < cost) return state
  const pet = state.pet ?? { level: 1, experience: 0, bamboo: 2, fedCount: 0 }
  return {
    ...state,
    spentStars: (state.spentStars ?? 0) + cost,
    pet: { ...pet, bamboo: pet.bamboo + count },
  }
}

export function feedPet(state: GameState): { state: GameState; leveledUp: boolean } {
  const pet = state.pet ?? { level: 1, experience: 0, bamboo: 2, fedCount: 0 }
  if (pet.bamboo < 1) return { state, leveledUp: false }
  const experience = pet.experience + 25
  const leveledUp = experience >= 100
  return {
    state: {
      ...state,
      pet: {
        ...pet,
        bamboo: pet.bamboo - 1,
        fedCount: pet.fedCount + 1,
        level: pet.level + (leveledUp ? 1 : 0),
        experience: leveledUp ? experience - 100 : experience,
      },
    },
    leveledUp,
  }
}

export function mistakePoints(state: GameState, volumeId?: VolumeId): Point[] {
  const points = volumeId ? pointsForVolume(volumeId) : catalog.points
  return points.filter((point) => {
    const record = state.records[point.id]
    return record && record.wrongCount > 0 && pointStage(point, state) !== 'mastered'
  })
}

export function clearMistake(state: GameState, id: string): GameState {
  if (!state.records[id]) return state
  const records = { ...state.records }
  records[id] = { ...records[id], wrongCount: 0 }
  return { ...state, records }
}

export function getBadges(state: GameState): Badge[] {
  const stars = totalStars(state)
  const yw1Done = pointsForVolume('YW1').filter((p) => pointStage(p, state) !== 'new').length
  const sx1Done = pointsForVolume('SX1').filter((p) => pointStage(p, state) !== 'new').length
  const yw2Done = pointsForVolume('YW2').filter((p) => pointStage(p, state) !== 'new').length
  const sx2Done = pointsForVolume('SX2').filter((p) => pointStage(p, state) !== 'new').length
  const conqueredMistakes = catalog.points.filter((p) => {
    const r = state.records[p.id]
    return r && r.wrongCount > 0 && pointStage(p, state) === 'mastered'
  }).length

  return [
    {
      id: 'first-star',
      name: '初涉探险',
      desc: '获得探险岛上的第 1 颗星星',
      icon: '⭐',
      unlocked: stars >= 1,
      progressText: `${Math.min(stars, 1)}/1`,
    },
    {
      id: 'star-20',
      name: '勤奋小达人',
      desc: '累计收集 20 颗探险星',
      icon: '🏅',
      unlocked: stars >= 20,
      progressText: `${Math.min(stars, 20)}/20`,
    },
    {
      id: 'star-100',
      name: '百星探险家',
      desc: '累计收集 100 颗探险星',
      icon: '👑',
      unlocked: stars >= 100,
      progressText: `${Math.min(stars, 100)}/100`,
    },
    {
      id: 'pinyin-master',
      name: '拼音小能手',
      desc: '在拼音森林探索 10 个知识点',
      icon: '🌳',
      unlocked: yw1Done >= 10,
      progressText: `${Math.min(yw1Done, 10)}/10`,
    },
    {
      id: 'math-beach',
      name: '沙滩数数星',
      desc: '在数字沙滩探索 10 个知识点',
      icon: '🏖️',
      unlocked: sx1Done >= 10,
      progressText: `${Math.min(sx1Done, 10)}/10`,
    },
    {
      id: 'cloud-story',
      name: '故事小博士',
      desc: '在故事云岛探索 10 个知识点',
      icon: '☁️',
      unlocked: yw2Done >= 10,
      progressText: `${Math.min(yw2Done, 10)}/10`,
    },
    {
      id: 'math-valley',
      name: '智慧登山者',
      desc: '在智慧山谷探索 10 个知识点',
      icon: '⛰️',
      unlocked: sx2Done >= 10,
      progressText: `${Math.min(sx2Done, 10)}/10`,
    },
    {
      id: 'mistake-conqueror',
      name: '攻坚勇士',
      desc: '攻克并掌握曾答错的知识点',
      icon: '🎯',
      unlocked: conqueredMistakes >= 1,
      progressText: `${Math.min(conqueredMistakes, 1)}/1`,
    },
  ]
}
