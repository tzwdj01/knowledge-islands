import { useEffect, useRef, useState } from 'react'
import { AudioLines, Check, Mic, Square, Volume2 } from 'lucide-react'
import { aiRequest, getAiSession } from './lib/ai'
import { extractSpokenTarget, getVoiceDescription, speechMatchScore, starsForSpeechScore, synthesizeTaskSpeech } from './lib/aiExperience'

interface Props {
  text: string
  onScore?: (stars: number) => void
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index))
  }
  writeText(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let index = 0; index < samples.length; index++) {
    const value = Math.max(-1, Math.min(1, samples[index]))
    view.setInt16(44 + index * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

async function toMono16kWav(blob: Blob): Promise<Blob> {
  const AudioContextConstructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextConstructor) throw new Error('这个浏览器暂时无法处理录音。')
  const context = new AudioContextConstructor()
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer())
    const sampleRate = 16_000
    const length = Math.ceil(decoded.length * sampleRate / decoded.sampleRate)
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index))
    const mono = new Float32Array(length)
    for (let index = 0; index < length; index++) {
      const sourcePosition = index * decoded.sampleRate / sampleRate
      const left = Math.floor(sourcePosition)
      const fraction = sourcePosition - left
      let value = 0
      for (const channel of channels) {
        const first = channel[Math.min(left, channel.length - 1)] ?? 0
        const second = channel[Math.min(left + 1, channel.length - 1)] ?? first
        value += first + (second - first) * fraction
      }
      mono[index] = value / channels.length
    }
    return encodeWav(mono, sampleRate)
  } finally {
    await context.close()
  }
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('无法读取录音，请再试一次。'))
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.readAsDataURL(blob)
  })
}

export default function SpeechTools({ text, onScore }: Props) {
  const target = extractSpokenTarget(text)
  const [unlocked, setUnlocked] = useState(() => !!getAiSession())
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [score, setScore] = useState<number | null>(null)
  const [stars, setStars] = useState<number | null>(null)
  const [transcript, setTranscript] = useState('')
  const [message, setMessage] = useState('')
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const timer = useRef<number | undefined>(undefined)
  const activeAudio = useRef<HTMLAudioElement | null>(null)
  const activeObjectUrl = useRef('')
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    const syncSession = () => setUnlocked(!!getAiSession())
    window.addEventListener('storage', syncSession)
    window.addEventListener('focus', syncSession)
    return () => {
      mounted.current = false
      window.removeEventListener('storage', syncSession)
      window.removeEventListener('focus', syncSession)
      if (timer.current) window.clearTimeout(timer.current)
      if (recorder.current?.state === 'recording') recorder.current.stop()
      stream.current?.getTracks().forEach((track) => track.stop())
      activeAudio.current?.pause()
      if (activeObjectUrl.current) URL.revokeObjectURL(activeObjectUrl.current)
    }
  }, [])

  async function playExample() {
    if (busy || recording) return
    setBusy(true)
    setMessage('正在准备角色示范朗读…')
    try {
      const blob = await synthesizeTaskSpeech(target, getVoiceDescription())
      if (!mounted.current) return
      if (activeObjectUrl.current) URL.revokeObjectURL(activeObjectUrl.current)
      activeObjectUrl.current = URL.createObjectURL(blob)
      const audio = new Audio(activeObjectUrl.current)
      activeAudio.current = audio
      audio.onended = () => setMessage('示范播放完成。轮到你试一试！')
      await audio.play()
      setMessage('角色示范正在播放。')
    } catch (error) {
      if (mounted.current) setMessage(error instanceof Error ? error.message : '示范朗读暂时不可用。')
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  async function recognize(blob: Blob) {
    setBusy(true)
    setMessage('小岛伙伴正在听一听…')
    try {
      const wav = await toMono16kWav(blob)
      const result = await aiRequest<{ transcript: string }>('asr', { audioBase64: await toBase64(wav) })
      if (!mounted.current) return
      const transcriptText = result.transcript.trim()
      const match = speechMatchScore(target, transcriptText)
      const earned = starsForSpeechScore(match)
      setTranscript(transcriptText)
      setScore(match)
      setStars(earned)
      onScore?.(earned)
      setMessage(transcriptText
        ? earned > 0
          ? `文字匹配参考 ${match} 分。读得真认真！完成自评时可收下 ${earned} 颗星。`
          : `文字匹配参考 ${match} 分。识别可能有误，慢慢再读一次也可以。`
        : '这次没有识别出文字。可以靠近麦克风再试，也可以按平时方式完成自评。')
    } catch (error) {
      if (mounted.current) {
        setMessage(error instanceof Error ? error.message : '语音识别暂时不可用。')
        setUnlocked(!!getAiSession())
      }
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  async function startRecording() {
    setMessage('')
    setScore(null)
    setStars(null)
    setTranscript('')
    onScore?.(0)
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext || !('MediaRecorder' in window)) {
      setMessage('请使用 HTTPS 网页并允许麦克风，才能录音。')
      return
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mounted.current) { media.getTracks().forEach((track) => track.stop()); return }
      stream.current = media
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type))
      const instance = new MediaRecorder(media, mimeType ? { mimeType } : undefined)
      chunks.current = []
      instance.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data) }
      instance.onstop = () => {
        media.getTracks().forEach((track) => track.stop())
        stream.current = null
        if (!mounted.current) return
        const recordingBlob = new Blob(chunks.current, { type: instance.mimeType || 'audio/webm' })
        if (recordingBlob.size) void recognize(recordingBlob)
        else setMessage('没有录到声音，再试一次吧。')
      }
      recorder.current = instance
      instance.start(200)
      setRecording(true)
      timer.current = window.setTimeout(stopRecording, 30_000)
    } catch (error) {
      if (!mounted.current) return
      const name = error instanceof DOMException ? error.name : ''
      setMessage(name === 'NotAllowedError' ? '麦克风权限未开启，请在浏览器地址栏允许使用麦克风。' : '没有找到可用麦克风，请检查设备后重试。')
    }
  }

  function stopRecording() {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = undefined
    if (recorder.current?.state === 'recording') {
      recorder.current.stop()
      setRecording(false)
    }
  }

  if (!unlocked) return <div className="ai-speech-locked">🔒 AI 跟读需要家长先在“家长设置”中解锁；你仍可以照常练习并自评。</div>

  return <div className="ai-speech-tools">
    <div className="ai-speech-target"><strong>跟读小句</strong><span>{target}</span></div>
    <div className="ai-speech-buttons">
      <button type="button" className="secondary-button" onClick={() => void playExample()} disabled={busy || recording}><Volume2 size={17} />角色示范</button>
      {recording
        ? <button type="button" className="primary-button recording-button" onClick={stopRecording}><Square size={16} />停止并识别</button>
        : <button type="button" className="secondary-button" onClick={() => void startRecording()} disabled={busy}><Mic size={17} />{busy ? '请稍等…' : '我来跟读'}</button>}
    </div>
    <p className="ai-speech-caption">系统按识别文字与目标小句的相似程度给出参考分，不评价口音，也不改变“已掌握”记录。录音最长 30 秒，点击后才会发送识别。</p>
    {recording && <p className="ai-speech-message" role="status"><AudioLines size={17} />正在录音，读完后点“停止并识别”。</p>}
    {message && !recording && <p className="ai-speech-message" role="status"><AudioLines size={17} />{message}</p>}
    {score !== null && <div className="speech-score-card">
      <div className="speech-score-number"><span>{score}</span><small>参考分</small></div>
      <div><strong>{score >= 90 ? '和目标很接近！' : score >= 60 ? '已经读出不少内容！' : transcript ? '再听听示范，慢慢练。' : '再试一次也可以。'}</strong><p>{transcript ? `识别到：“${transcript}”` : '没有识别到清楚的文字'}</p><small>{stars && stars > 0 ? `本次跟读最多可获得 ${stars} 颗努力星` : '完成自评练习仍可获得 1 颗努力星'}</small></div>
      <Check size={20} aria-hidden="true" />
    </div>}
  </div>
}
