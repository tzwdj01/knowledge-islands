import { useEffect, useRef, useState } from 'react'
import { AudioLines, Mic, Square, Volume2 } from 'lucide-react'
import { aiRequest, getAiSession } from './lib/ai'

interface Props { text: string }

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeText = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)))
  writeText(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); writeText(8, 'WAVE')
  writeText(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  writeText(36, 'data'); view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

async function toWav(blob: Blob): Promise<Blob> {
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer())
    const rate = 16_000
    const length = Math.ceil(decoded.length * rate / decoded.sampleRate)
    const mono = new Float32Array(length)
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index))
    for (let i = 0; i < length; i++) {
      const sourceIndex = Math.min(decoded.length - 1, Math.floor(i * decoded.sampleRate / rate))
      let sample = 0
      for (const channel of channels) sample += channel[sourceIndex] || 0
      mono[i] = sample / channels.length
    }
    return encodeWav(mono, rate)
  } finally { await context.close() }
}

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('无法读取录音。'))
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.readAsDataURL(blob)
  })
}

export default function SpeechTools({ text }: Props) {
  const [unlocked, setUnlocked] = useState(!!getAiSession())
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [message, setMessage] = useState('')
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const timer = useRef<number | undefined>(undefined)
  const audioUrl = useRef('')

  useEffect(() => {
    const sync = () => setUnlocked(!!getAiSession())
    window.addEventListener('storage', sync)
    window.addEventListener('focus', sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('focus', sync)
      if (timer.current) window.clearTimeout(timer.current)
      stream.current?.getTracks().forEach((track) => track.stop())
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current)
    }
  }, [])

  async function startRecording() {
    setMessage('')
    setTranscript('')
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      setMessage('请用 HTTPS 网页并允许麦克风，才能录音。')
      return
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.current = media
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : ''
      const instance = new MediaRecorder(media, mimeType ? { mimeType } : undefined)
      chunks.current = []
      instance.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data) }
      instance.onstop = () => {
        media.getTracks().forEach((track) => track.stop())
        stream.current = null
        void transcribe(new Blob(chunks.current, { type: instance.mimeType || 'audio/webm' }))
      }
      recorder.current = instance
      instance.start()
      setRecording(true)
      timer.current = window.setTimeout(stopRecording, 60_000)
    } catch {
      setMessage('没有获得麦克风权限。请检查浏览器设置后再试。')
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

  async function transcribe(recordingBlob: Blob) {
    setBusy(true)
    setMessage('正在把录音转换成文字…')
    try {
      const wav = await toWav(recordingBlob)
      const result = await aiRequest<{ transcript: string }>('asr', { audioBase64: await base64(wav) })
      setTranscript(result.transcript)
      setMessage('这是语音识别结果，请和示范内容一起参考。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '语音识别暂时不可用。')
      setUnlocked(!!getAiSession())
    } finally { setBusy(false) }
  }

  async function speakExample() {
    setBusy(true)
    setMessage('正在生成示范朗读…')
    try {
      const result = await aiRequest<{ audioBase64: string; mimeType: string }>('tts', { text: text.slice(0, 300) })
      const binary = atob(result.audioBase64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const blob = new Blob([bytes], { type: result.mimeType })
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current)
      audioUrl.current = URL.createObjectURL(blob)
      const audio = new Audio(audioUrl.current)
      await audio.play()
      setMessage('示范朗读正在播放。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '语音合成暂时不可用。')
      setUnlocked(!!getAiSession())
    } finally { setBusy(false) }
  }

  if (!unlocked) return <div className="ai-speech-locked"><LockIcon />如需 AI 识别和示范朗读，请家长先在“家长设置”解锁 AI 功能。</div>

  return <div className="ai-speech-tools">
    <div className="ai-speech-buttons">
      <button type="button" className="secondary-button" onClick={() => void speakExample()} disabled={busy || recording}><Volume2 size={17} />AI 示范朗读</button>
      {recording
        ? <button type="button" className="primary-button recording-button" onClick={stopRecording}><Square size={16} />停止并识别</button>
        : <button type="button" className="secondary-button" onClick={() => void startRecording()} disabled={busy}><Mic size={17} />{busy ? '请稍等…' : '录一段给 AI 听'}</button>}
    </div>
    <p className="ai-speech-caption">识别会将最多 1 分钟的录音发送给 MiMo。结果仅作练习参考，仍由孩子自评。</p>
    {message && <p className="ai-speech-message" role="status"><AudioLines size={17} />{message}</p>}
    {transcript && <div className="ai-transcript"><strong>识别到的内容</strong><p>{transcript}</p><small>参考练习：{text}</small></div>}
  </div>
}

function LockIcon() {
  return <span aria-hidden="true">🔒</span>
}
