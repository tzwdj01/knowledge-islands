import { useEffect, useState } from 'react'
import { KeyRound, LockKeyhole, LogOut, Sparkles } from 'lucide-react'
import { aiRequest, clearAiSession, getAiSession, setAiSession } from './lib/ai'

interface Status { configured: boolean; sessionHours: number }

export default function AiSettings() {
  const [status, setStatus] = useState<Status | null>(null)
  const [password, setPassword] = useState('')
  const [unlocked, setUnlocked] = useState(!!getAiSession())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    aiRequest<Status>('status').then((value) => { if (active) setStatus(value) })
      .catch(() => { if (active) setStatus({ configured: false, sessionHours: 6 }) })
    return () => { active = false }
  }, [])

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

  return <section className="settings-card ai-settings-card">
    <div className="settings-icon violet"><Sparkles size={25} /></div>
    <div className="ai-settings-heading"><div><h2>AI 伴学实验室</h2><p>按需使用 MiMo 语音识别和示范朗读。原有游戏、离线语音和学习进度不受影响。</p></div>
      {unlocked && <button type="button" className="secondary-button ai-lock-button" onClick={lock}><LogOut size={17} />锁定 AI</button>}
    </div>
    <div className="ai-notice"><LockKeyhole size={17} /><span>录音只在你点击识别后发送给 MiMo；识别结果仅供练习参考，不会自动判定掌握。</span></div>
    {!status?.configured && <p className="ai-status-note">{status ? '服务器尚未配置可用于应用功能的按量 API 密钥。' : '正在连接 AI 服务配置…'} 设置好服务器密钥后即可解锁使用。</p>}
    {status?.configured && !unlocked && <form className="ai-unlock-form" onSubmit={(event) => void unlock(event)}>
      <label htmlFor="ai-parent-password">家长密码</label>
      <div className="ai-password-row"><input id="ai-parent-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="输入家长密码" required /><button type="submit" className="primary-button" disabled={busy || !password}><KeyRound size={17} />{busy ? '验证中…' : '解锁 AI'}</button></div>
    </form>}
    {unlocked && status?.configured && <p className="ai-status-note ai-ready"><span className="offline-dot" />AI 功能已解锁，本次浏览器会话约 {status.sessionHours} 小时有效。</p>}
    {message && <p className="ai-message" role="status">{message}</p>}
  </section>
}
