import { aiRequest, getAiSession } from './ai'

export type VoiceId = 'sister' | 'brother' | 'grandpa' | 'island' | 'custom'

export interface VoicePreset {
  id: VoiceId
  name: string
  icon: string
  description: string
}

export const VOICE_PRESETS: VoicePreset[] = [
  { id: 'sister', name: '温柔大姐姐', icon: '👧', description: '年轻、亲切的普通话女声，温柔明亮，语速稍慢，吐字清楚，像耐心陪伴孩子的大姐姐。' },
  { id: 'brother', name: '阳光大哥哥', icon: '👦', description: '年轻、阳光的普通话男声，清爽有活力，语气友好，语速适中，像带孩子探险的大哥哥。' },
  { id: 'grandpa', name: '鹿爷爷', icon: '🦌', description: '温和慈祥的长者男声，普通话清晰，语速舒缓，耐心亲切，像讲故事的鹿爷爷。' },
  { id: 'island', name: '小岛宝', icon: '🐼', description: '软萌活泼的卡通伙伴声音，普通话清晰、自然可爱，不过分尖细，像一只热情的小熊猫。' },
]

export interface VoicePreferences {
  voiceId: VoiceId
  customDescription: string
}

const PREFERENCES_KEY = 'knowledge-islands-voice-preferences-v1'
const AUDIO_CACHE_NAME = 'island-ai-audio-v1'
const AUDIO_CACHE_LIMIT = 60

export const DEFAULT_VOICE_PREFERENCES: VoicePreferences = {
  voiceId: 'sister',
  customDescription: '清晰、温柔、自然的普通话儿童故事讲述声音，语速稍慢，发音准确。',
}

export function getVoicePreferences(): VoicePreferences {
  try {
    const value = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || 'null') as Partial<VoicePreferences> | null
    const voiceId = value?.voiceId === 'custom' || VOICE_PRESETS.some((preset) => preset.id === value?.voiceId)
      ? value!.voiceId as VoiceId
      : DEFAULT_VOICE_PREFERENCES.voiceId
    return {
      voiceId,
      customDescription: typeof value?.customDescription === 'string'
        ? value.customDescription.slice(0, 240)
        : DEFAULT_VOICE_PREFERENCES.customDescription,
    }
  } catch {
    return { ...DEFAULT_VOICE_PREFERENCES }
  }
}

export function saveVoicePreferences(preferences: VoicePreferences): void {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({
      voiceId: preferences.voiceId === 'custom' || VOICE_PRESETS.some((preset) => preset.id === preferences.voiceId) ? preferences.voiceId : 'sister',
      customDescription: preferences.customDescription.slice(0, 240),
    }))
  } catch { /* Browser storage can be disabled in private mode. */ }
}

export function getVoiceDescription(preferences = getVoicePreferences()): string {
  if (preferences.voiceId === 'custom') return preferences.customDescription.trim() || DEFAULT_VOICE_PREFERENCES.customDescription
  return VOICE_PRESETS.find((preset) => preset.id === preferences.voiceId)?.description ?? VOICE_PRESETS[0].description
}

export function formatSpokenScript(text: string): string {
  return text
    .replace(/(\d+)\s*\+\s*(\d+)/g, '$1加$2')
    .replace(/(\d+)\s*-\s*(\d+)/g, '$1减$2')
    .replace(/\s*\+\s*/g, ' 加 ')
    .replace(/×/g, '乘')
    .replace(/÷/g, '除以')
    .replace(/=/g, '等于')
    .replace(/[□▢]/g, '方框')
    .replace(/>/g, '大于')
    .replace(/</g, '小于')
    .replace(/[?？]/g, '几')
    .replace(/●/g, '圆点')
    .replace(/_{2,}/g, '横线')
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractSpokenTarget(text: string): string {
  const quoted = text.match(/[“「]([^”」]+)[”」]/)
  if (quoted?.[1]?.trim()) return quoted[1].trim()
  const afterColon = text.match(/(?:读一读|朗读|读出|说说|背诵)[：:]([^；;。\n]+)/)
  if (afterColon?.[1]?.trim()) return afterColon[1].trim()
  return text
    .replace(/^(?:原创朗读小句|识字小侦探)[：:]\s*/, '')
    .replace(/(?:指着字读.*|先读两遍.*|练熟后.*)$/, '')
    .trim()
}

export function speechMatchScore(target: string, transcript: string): number {
  const normalize = (value: string) => Array.from(value.toLocaleLowerCase().replace(/[^\p{Script=Han}a-z0-9]/giu, ''))
  const expected = normalize(target)
  const spoken = normalize(transcript)
  if (!expected.length || !spoken.length) return 0
  const previous = Array.from({ length: spoken.length + 1 }, (_, index) => index)
  for (let row = 1; row <= expected.length; row++) {
    let diagonal = previous[0]
    previous[0] = row
    for (let col = 1; col <= spoken.length; col++) {
      const above = previous[col]
      previous[col] = Math.min(previous[col] + 1, previous[col - 1] + 1, diagonal + (expected[row - 1] === spoken[col - 1] ? 0 : 1))
      diagonal = above
    }
  }
  return Math.max(0, Math.round((1 - previous[spoken.length] / Math.max(expected.length, spoken.length)) * 100))
}

export function starsForSpeechScore(score: number): number {
  if (score >= 90) return 3
  if (score >= 75) return 2
  if (score >= 60) return 1
  return 0
}

function audioCacheKey(text: string, voiceDescription: string): string {
  let hash = 2166136261
  for (const char of `${voiceDescription}\u0000${text}`) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return `${location.origin}/__island-ai-audio__/${(hash >>> 0).toString(16)}`
}

function decodeAudio(audioBase64: string, mimeType: string): Blob {
  const binary = atob(audioBase64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: mimeType })
}

export async function synthesizeTaskSpeech(text: string, voiceDescription = getVoiceDescription()): Promise<Blob> {
  const spokenText = formatSpokenScript(text).slice(0, 300)
  if (!spokenText) throw new Error('没有可朗读的内容。')
  const cacheKey = audioCacheKey(spokenText, voiceDescription)
  let cache: Cache | undefined
  try {
    if ('caches' in globalThis) {
      cache = await caches.open(AUDIO_CACHE_NAME)
      const cached = await cache.match(cacheKey)
      if (cached) return await cached.blob()
    }
  } catch { /* Audio still works when Cache Storage is unavailable. */ }

  if (!getAiSession()) throw new Error('请先在家长设置中解锁 AI 语音。')
  const result = await aiRequest<{ audioBase64: string; mimeType: string }>('tts', { text: spokenText, voiceDescription })
  const blob = decodeAudio(result.audioBase64, result.mimeType || 'audio/wav')
  if (!blob.size || blob.size > 8_000_000) throw new Error('语音文件大小不符合要求。')

  if (cache) {
    try {
      const keys = await cache.keys()
      if (keys.length >= AUDIO_CACHE_LIMIT) await cache.delete(keys[0])
      await cache.put(cacheKey, new Response(blob, { headers: { 'Content-Type': blob.type || 'audio/wav' } }))
    } catch { /* A cache quota error should not block playback. */ }
  }
  return blob
}

export async function requestSocraticHint(input: {
  pointName: string
  prompt: string
  hint: string
  wrongAnswer: string
}): Promise<string> {
  const result = await aiRequest<{ hint: string }>('hint', input)
  return result.hint
}
