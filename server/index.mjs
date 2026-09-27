import crypto from 'node:crypto'
import express from 'express'

const app = express()
const port = Number(process.env.PORT || 4178)
const host = process.env.HOST || '127.0.0.1'
const apiKey = process.env.XIAOMI_API_KEY?.trim() || ''
const defaultApiBaseUrl = apiKey.startsWith('tp-')
  ? 'https://token-plan-cn.xiaomimimo.com/v1'
  : 'https://api.xiaomimimo.com/v1'
const apiBaseUrl = (process.env.XIAOMI_BASE_URL || defaultApiBaseUrl).trim().replace(/\/+$/, '')
const accessPassword = process.env.AI_ACCESS_PASSWORD || ''
const sessionSecret = process.env.AI_SESSION_SECRET || ''
const sessionLifetimeSeconds = 6 * 60 * 60
const attempts = new Map()

app.disable('x-powered-by')
app.use(express.json({ limit: '8mb' }))

function isConfigured() {
  return /^(?:sk|tp)-[A-Za-z0-9_-]{12,}$/.test(apiKey) && accessPassword.length >= 8 && sessionSecret.length >= 32
}

function sameSecret(received, expected) {
  const a = crypto.createHash('sha256').update(String(received)).digest()
  const b = crypto.createHash('sha256').update(String(expected)).digest()
  return crypto.timingSafeEqual(a, b)
}

function issueSession() {
  const expires = Math.floor(Date.now() / 1000) + sessionLifetimeSeconds
  const nonce = crypto.randomBytes(16).toString('hex')
  const payload = `${expires}.${nonce}`
  const signature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

function validSession(token = '') {
  const [expiresText, nonce, signature, extra] = token.split('.')
  const expires = Number(expiresText)
  if (!expires || expires <= Math.floor(Date.now() / 1000) || !nonce || !signature || extra) return false
  const payload = `${expiresText}.${nonce}`
  const expected = crypto.createHmac('sha256', sessionSecret).update(payload).digest()
  let supplied
  try { supplied = Buffer.from(signature, 'base64url') } catch { return false }
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected)
}

function requireSession(req, res, next) {
  if (!isConfigured()) return res.status(503).json({ error: 'AI 服务尚未配置按量 API 密钥和家长密码。' })
  const authorization = req.get('authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!validSession(token)) return res.status(401).json({ error: '家长验证已过期，请重新输入密码。' })
  next()
}

function allowPasswordAttempt(req, res, next) {
  const now = Date.now()
  const key = req.ip || req.socket.remoteAddress || 'unknown'
  const current = attempts.get(key) || { count: 0, resetAt: now + 10 * 60_000 }
  if (current.resetAt <= now) {
    current.count = 0
    current.resetAt = now + 10 * 60_000
  }
  if (current.count >= 8) return res.status(429).json({ error: '尝试次数较多，请稍后再试。' })
  current.count += 1
  attempts.set(key, current)
  next()
}

async function mimoRequest(body) {
  const response = await fetch(`${apiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'api-key': apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  })
  if (!response.ok) {
    console.error('MiMo request failed:', response.status)
    throw new Error(response.status === 429 ? '模型服务繁忙，请稍后再试。' : '模型服务暂时不可用，请稍后再试。')
  }
  return response.json()
}

app.get('/api/ai/status', (_req, res) => {
  res.json({ configured: isConfigured(), sessionHours: sessionLifetimeSeconds / 3600 })
})

app.post('/api/ai/unlock', allowPasswordAttempt, (req, res) => {
  if (!isConfigured()) return res.status(503).json({ error: 'AI 服务尚未配置，请先在服务器设置按量 API 密钥和家长密码。' })
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (!sameSecret(password, accessPassword)) return res.status(401).json({ error: '密码不正确，请再试一次。' })
  res.json({ token: issueSession(), expiresIn: sessionLifetimeSeconds })
})

app.post('/api/ai/asr', requireSession, async (req, res) => {
  const audio = req.body?.audioBase64
  if (typeof audio !== 'string' || audio.length < 64 || audio.length > 7_500_000) {
    return res.status(400).json({ error: '录音格式不正确或时间太长，请缩短后重试。' })
  }
  try {
    const result = await mimoRequest({
      model: 'mimo-v2.5-asr',
      messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: `data:audio/wav;base64,${audio}` } }] }],
      asr_options: { language: 'zh' },
    })
    const transcript = result?.choices?.[0]?.message?.content
    if (typeof transcript !== 'string') throw new Error('模型没有返回文字转写。')
    res.json({ transcript })
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : '语音识别暂时不可用。' })
  }
})

app.post('/api/ai/tts', requireSession, async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
  if (!text || text.length > 300) return res.status(400).json({ error: '朗读内容需为 1 到 300 个字。' })
  try {
    const result = await mimoRequest({
      model: 'mimo-v2.5-tts',
      messages: [
        { role: 'user', content: '请用温柔、清晰、语速稍慢的普通话教师语气朗读，适合小学低年级孩子听。' },
        { role: 'assistant', content: text },
      ],
      audio: { format: 'wav', voice: '冰糖' },
    })
    const encoded = result?.choices?.[0]?.message?.audio?.data
    if (typeof encoded !== 'string') throw new Error('语音服务没有返回音频。')
    const audio = Buffer.from(encoded, 'base64')
    if (!audio.length || audio.length > 8_000_000) throw new Error('生成的音频大小不符合要求。')
    res.json({ audioBase64: audio.toString('base64'), mimeType: 'audio/wav' })
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : '语音合成暂时不可用。' })
  }
})

app.use((error, _req, res, _next) => {
  if (error?.type === 'entity.too.large') return res.status(413).json({ error: '请求内容过大，请缩短录音后重试。' })
  console.error('AI API error:', error?.message || 'unknown')
  res.status(500).json({ error: '请求暂时无法完成，请稍后再试。' })
})

app.listen(port, host, () => {
  console.log(`AI API listening on ${host}:${port}; baseUrl=${apiBaseUrl}; configured=${isConfigured()}`)
})
