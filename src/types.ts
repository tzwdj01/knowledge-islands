export type VolumeId = 'YW1' | 'YW2' | 'SX1' | 'SX2'
export type VariantKind = 'choice' | 'number' | 'order' | 'tiles' | 'match'

export interface AutoVariant {
  kind: VariantKind
  prompt: string
  options?: string[]
  items?: string[]
  pairs?: { left: string; right: string }[]
  answer: string | number | string[] | { left: string; right: string }[]
  target?: number
  icon?: string
  hint: string
  explanation: string
  audio: string
  speechText?: string
}

export interface AutoTask {
  mode: 'auto'
  kind: VariantKind
  instruction: string
  variants: AutoVariant[]
}

export interface SelfTask {
  mode: 'self'
  kind: 'draw' | 'speak' | 'think'
  instruction: string
  practice: string
  example: string
  checklist: string[]
  originalTextNeeded: boolean
  audio: string
}

export interface Point {
  id: string
  name: string
  type: string
  level: string
  source: string
  volumeId: VolumeId
  unitId: string
  lessonId: string
  order: number
  prereq: string[]
  leadsTo: string[]
  task: AutoTask | SelfTask
}

export interface Volume {
  id: VolumeId
  subject: string
  grade: string
  label: string
  edition: string
  unitIds: string[]
}

export interface Unit {
  id: string
  volumeId: VolumeId
  name: string
  goal: string
  order: number
  lessonIds: string[]
}

export interface Lesson {
  id: string
  unitId: string
  name: string
  page: number | null
  order: number
  pointIds: string[]
}

export interface Catalog {
  version: string
  sourceVersion: string
  volumes: Volume[]
  units: Unit[]
  lessons: Lesson[]
  points: Point[]
  crossGradeLinks: { fromId: string; toId: string }[]
}

export interface ProgressRecord {
  correctDays: string[]
  selfDays: string[]
  lastAttemptDay?: string
  nextDue?: string
  lastVariant: number
  wrongCount: number
  selfRating?: 'practiced' | 'confident'
  stars: number
  starDays: string[]
}

export interface GameState {
  version: 1
  activeVolume: VolumeId
  muted: boolean
  records: Record<string, ProgressRecord>
}

export interface Badge {
  id: string
  name: string
  desc: string
  icon: string
  unlocked: boolean
  progressText: string
}
