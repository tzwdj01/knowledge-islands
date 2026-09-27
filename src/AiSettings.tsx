import { useEffect, useState } from 'react'
import { AudioLines, Bot, KeyRound, LockKeyhole, LogOut, Mic, Sparkles, Volume2 } from 'lucide-react'
import { aiRequest, clearAiSession, getAiSession, setAiSession } from './lib/ai'
import { DEFAULT_VOICE_PREFERENCES, getVoiceDescription, getVoicePreferences, saveVoicePreferences, synthesizeTaskSpeech, VOICE_PRESETS, type VoiceId, type VoicePreferences } from './lib/aiExperience'

interface Status { configured: boolean; sessionHours: number }

export interface LearningSummary {
  counts: { explored: number; mastered: number; selfAssessed: number; needsPractice: number }
  items: { name: string; subject: string; wrongCount: number; correctDays: number; stage: string }[]
}

interface Props { learningSummary: LearningSummary }

const CUSTOM_VOICE = { id: 'custom' as const, name: '自定义声音', icon: '🎨' }

export default function AiSettings({ learningSummary }: Props) {
  const [status, setStatus] = useState<Status | null>(null)
  const [password, setPassword] = useState('')
  const [unlocked, setUnlocked] = useState(!!getAiSession())
  const [busy, setBusy] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [reportBusy, setReportBusy] = useState(false)
  const [report, setReport] = useState('')
  const [message, setMessage] = useState('')
  const [voice, setVoice] = useState<VoicePreferences>(() => ({ ...DEFAULT_VOICE_PREFERENCES, ...getVoicePreferences() }))

  useEffect(() => {
    let active = true
    aiRequest<Status>('status').then((value) => { if (active) setStatus(value) })
      .catch(() => { if (active) setStatus({ configured: false, sessionHours: 6 }) })
    return () => { active = false }
  }, [])

  function changeVoice(next: VoicePreferences) {
    setVoice(next)
    saveVoicePreferences(next)
  }

  async function unlock(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      const result = await aiRequest<{ token: string }>('unlock', { password })
      setAiSession(result.token)
      setUnlocked(true)
      setPassword('')
      setMessage('AI 功能已解锁；关闭浏览器或会话过期后需要重新输入密码。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '暂时无法解锁 AI 功能。')
    } finally { setBusy(false) }
  }

  function lock() {
    clearAiSession()
    setUnlocked(false)
    setMessage('AI 功能已锁定。')
  }

  async function previewVoice() {
    if (!unlocked) return
    setPreviewing(true)
    setMessage('正在准备音色试听…')
    let url = ''
    try {
      const blob = await synthesizeTaskSpeech('你好呀，小探险家！今天我们一起发现新的知识吧。', getVoiceDescription(voice))
      url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => URL.revokeObjectURL(url)
      await audio.play()
      setMessage('音色试听正在播放。')
    } catch (error) {
      if (url) URL.revokeObjectURL(url)
      setMessage(error instanceof Error ? error.message : '音色试听暂时不可用。')
    } finally { setPreviewing(false) }
  }

  async function createReport() {
    if (!unlocked) return
    setReportBusy(true)
    setReport('')
    setMessage('正在整理本设备的学习记录…')
    try {
      const result = await aiRequest<{ report: string }>('diagnosis', learningSummary)
      setReport(result.report)
      setMessage('学情建议已生成。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '学情建议暂时不可用。')
    } finally { setReportBusy(false) }
  }

  const allVoiceChoices = [...VOICE_PRESETS, CUSTOM_VOICE]

  return <section className="settings-card ai-settings-card">
    <div className="settings-icon violet"><Sparkles size={25} /></div>
    <div className="ai-settings-heading">
      <div><h2>AI 伴学实验室</h2><p>角色伴读、跟读文字参考和温和的错题启发。AI 不替代学习记录里的掌握判定。</p></div>
      {unlocked && <button type="button" className="secondary-button ai-lock-button" onClick={lock}><LogOut size={17} />锁定 AI</button>}
    </div>
    <div className="ai-notice"><LockKeyhole size={17} /><span>录音只在点击识别后发送；学习报告只在点击生成后提交匿名汇总，不包含姓名或账号。</span></div>
    {!status?.configured && <p className="ai-status-note">{status ? '服务器尚未配置 AI 服务。普通题目、离线语音和进度记录仍可使用。' : '正在连接 AI 服务配置…'}</p>}
    {status?.configured && !unlocked && <form className="ai-unlock-form" onSubmit={(event) => void unlock(event)}>
      <label htmlFor="ai-parent-password">家长密码</label>
      <div className="ai-password-row"><input id="ai-parent-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="输入家长密码" required /><button type="submit" className="primary-button" disabled={busy || !password}><KeyRound size={17} />{busy ? '验证中…' : '解锁 AI'}</button></div>
    </form>}
    {unlocked && status?.configured && <p className="ai-status-note ai-ready"><span className="offline-dot" />AI 功能已解锁，本次浏览器会话约 {status.sessionHours} 小时有效。</p>}

    <div className="voice-preferences">
      <div className="voice-section-title"><div><h3><AudioLines size={19} /> 选择小岛伙伴的声音</h3><p>选好的声音会用于题目伴读和原创跟读示范。</p></div><button type="button" className="secondary-button" onClick={() => void previewVoice()} disabled={!unlocked || previewing}><Volume2 size={17} />{previewing ? '生成中…' : '试听声音'}</button></div>
      <div className="voice-choice-grid">{allVoiceChoices.map((preset) => <button key={preset.id} type="button" className={`voice-choice ${voice.voiceId === preset.id ? 'selected' : ''}`} onClick={() => changeVoice({ ...voice, voiceId: preset.id as VoiceId })} aria-pressed={voice.voiceId === preset.id}><span>{preset.icon}</span><strong>{preset.name}</strong></button>)}</div>
      {voice.voiceId === 'custom' && <label className="voice-custom-label" htmlFor="custom-voice-description">描述你想要的声音<textarea id="custom-voice-description" maxLength={240} value={voice.customDescription} onChange={(event) => changeVoice({ ...voice, customDescription: event.target.value })} placeholder="例如：清亮温柔的普通话女声，语速稍慢，像耐心的绘本老师。" /><small>{voice.customDescription.length}/240 字</small></label>}
      {!unlocked && <small className="voice-unlock-note">家长解锁后可试听；选择会保存在本设备。</small>}
    </div>

    <div className="ai-diagnosis-section">
      <div><h3><Bot size={19} /> 家长学情建议</h3><p>基于错题与进度摘要，生成几条短小、可执行的陪伴建议。</p></div>
      <button type="button" className="secondary-button" disabled={!unlocked || reportBusy || learningSummary.counts.explored === 0} onClick={() => void createReport()}><Sparkles size={17} />{reportBusy ? '正在整理…' : '生成本地学情建议'}</button>
    </div>
    {report && <div className="ai-report" aria-live="polite">{report}</div>}
    {unlocked && <div className="ai-capabilities"><span><Mic size={16} />跟读反馈</span><span><AudioLines size={16} />多角色语音</span><span><Bot size={16} />Flash 启发</span></div>}
    {message && <p className="ai-message" role="status">{message}</p>}
  </section>
}
