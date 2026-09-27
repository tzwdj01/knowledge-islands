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
  const voiceDescription = typeof req.body?.voiceDescription === 'string' ? req.body.voiceDescription.trim() : ''
  if (!text || text.length > 300) return res.status(400).json({ error: '朗读内容需为 1 到 300 个字。' })
  if (voiceDescription.length > 240) return res.status(400).json({ error: '音色说明不能超过 240 个字。' })
  try {
    const messages = [
      { role: 'user', content: voiceDescription || '请用温柔、清晰、语速稍慢的普通话教师语气朗读，适合小学低年级孩子听。' },
      { role: 'assistant', content: text },
    ]
    let result
    if (voiceDescription) {
      try {
        result = await mimoRequest({ model: 'mimo-v2.5-tts-voicedesign', messages, audio: { format: 'wav', optimize_text_preview: true } })
      } catch {
        // Keep the sample playable when a cluster does not offer voice design.
        result = await mimoRequest({ model: 'mimo-v2.5-tts', messages, audio: { format: 'wav', voice: '冰糖' } })
      }
    } else {
      result = await mimoRequest({ model: 'mimo-v2.5-tts', messages, audio: { format: 'wav', voice: '冰糖' } })
    }
    let encoded = result?.choices?.[0]?.message?.audio?.data
    if (typeof encoded !== 'string' && voiceDescription) {
      result = await mimoRequest({ model: 'mimo-v2.5-tts', messages, audio: { format: 'wav', voice: '冰糖' } })
      encoded = result?.choices?.[0]?.message?.audio?.data
    }
    if (typeof encoded !== 'string') throw new Error('语音服务没有返回音频。')
    const audio = Buffer.from(encoded, 'base64')
    if (!audio.length || audio.length > 8_000_000) throw new Error('生成的音频大小不符合要求。')
    res.json({ audioBase64: audio.toString('base64'), mimeType: 'audio/wav' })
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : '语音合成暂时不可用。' })
  }
})

app.post('/api/ai/hint', requireSession, async (req, res) => {
  const pointName = typeof req.body?.pointName === 'string' ? req.body.pointName.trim().slice(0, 100) : ''
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim().slice(0, 300) : ''
  const hint = typeof req.body?.hint === 'string' ? req.body.hint.trim().slice(0, 300) : ''
  const wrongAnswer = typeof req.body?.wrongAnswer === 'string' ? req.body.wrongAnswer.trim().slice(0, 100) : ''
  if (!pointName || !prompt || !hint) return res.status(400).json({ error: '题目资料不完整，暂时无法生成启发。' })
  try {
    const result = await mimoRequest({
      model: 'mimo-v2.6-flash',
      messages: [
        {
          role: 'system',
          content: '你是小学一、二年级的温柔学习伙伴。只用简短、具体、鼓励的中文给孩子一个启发问题或思考方向。不要说最终答案、选项、数字结果，也不要替孩子做题。若无法确定，复述给定的提示并鼓励孩子再试。最多两句话。',
        },
        {
          role: 'user',
          content: `知识点：${pointName}\n题目：${prompt}\n已有提示：${hint}\n孩子刚才的回答：${wrongAnswer || '还没有作答'}\n请给一个不包含答案的启发。`,
        },
      ],
      max_tokens: 160,
      temperature: 0.5,
    })
    const generated = result?.choices?.[0]?.message?.content
    const aiHint = typeof generated === 'string' ? generated.trim().slice(0, 260) : ''
    res.json({ hint: aiHint || hint })
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : '小岛伙伴暂时无法回答，请先看题目提示。' })
  }
})

app.post('/api/ai/diagnosis', requireSession, async (req, res) => {
  const counts = req.body?.counts
  const items = req.body?.items
  if (!counts || typeof counts !== 'object' || !Array.isArray(items) || items.length > 25) {
    return res.status(400).json({ error: '学习摘要格式不正确。' })
  }
  const summary = {
    counts: {
      explored: Number.isInteger(counts.explored) ? Math.max(0, counts.explored) : 0,
      mastered: Number.isInteger(counts.mastered) ? Math.max(0, counts.mastered) : 0,
      selfAssessed: Number.isInteger(counts.selfAssessed) ? Math.max(0, counts.selfAssessed) : 0,
      needsPractice: Number.isInteger(counts.needsPractice) ? Math.max(0, counts.needsPractice) : 0,
    },
    items: items.map((item) => ({
      name: typeof item?.name === 'string' ? item.name.slice(0, 100) : '',
      subject: typeof item?.subject === 'string' ? item.subject.slice(0, 30) : '',
      wrongCount: Number.isInteger(item?.wrongCount) ? Math.max(0, Math.min(item.wrongCount, 100)) : 0,
      correctDays: Number.isInteger(item?.correctDays) ? Math.max(0, Math.min(item.correctDays, 3)) : 0,
      stage: ['未开始', '已练习', '自评会了', '已掌握'].includes(item?.stage) ? item.stage : '已练习',
    })).filter((item) => item.name),
  }
  try {
    const result = await mimoRequest({
      model: 'mimo-v2.6-flash',
      messages: [
        {
          role: 'system',
          content: '你是小学低年级家庭学习顾问。根据匿名的学习汇总，为家长写一份简短、温和、可执行的观察报告。分成“做得不错”“可以巩固”“陪伴建议”三段；只谈材料支持的事实，不推断孩子性格、智力或诊断，不批评，不制造焦虑。建议每天 5-10 分钟，鼓励具体表扬。',
        },
        { role: 'user', content: JSON.stringify(summary) },
      ],
      max_tokens: 500,
      temperature: 0.4,
    })
    const report = result?.choices?.[0]?.message?.content
    if (typeof report !== 'string' || !report.trim()) throw new Error('没有收到诊断建议。')
    res.json({ report: report.trim().slice(0, 2400) })
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : '学情建议暂时不可用，请稍后再试。' })
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
