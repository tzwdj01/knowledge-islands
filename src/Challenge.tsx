import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Eraser, Headphones, HelpCircle, Lightbulb, RotateCcw, Sparkles, Star } from 'lucide-react'
import { fireConfetti } from './lib/confetti'
import SpeechTools from './SpeechTools'
import type { AutoVariant, Point, ProgressRecord } from './types'

interface Props {
  point: Point
  record?: ProgressRecord
  onAuto: (correct: boolean) => void
  onSelf: (rating: 'practiced' | 'confident') => void
  onBack: () => void
  onNext: () => void
  playAudio: (path: string) => void
  muted: boolean
  hasNext: boolean
}

function DrawPad() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bgCanvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [color, setColor] = useState('#255e6c')
  const [lineWidth, setLineWidth] = useState(8)
  const [gridType, setGridType] = useState<'tian' | 'mi'>('tian')

  useEffect(() => {
    const bg = bgCanvasRef.current
    if (!bg) return
    const ctx = bg.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, bg.width, bg.height)

    const boxSize = 250
    const gap = (bg.width - boxSize * 3) / 4
    const top = (bg.height - boxSize) / 2

    for (let i = 0; i < 3; i++) {
      const left = gap + i * (boxSize + gap)
      ctx.strokeStyle = '#f3a8a8'
      ctx.lineWidth = 3
      ctx.setLineDash([])
      ctx.strokeRect(left, top, boxSize, boxSize)

      ctx.strokeStyle = '#f7c5c5'
      ctx.lineWidth = 1.5
      ctx.setLineDash([6, 5])

      ctx.beginPath()
      ctx.moveTo(left, top + boxSize / 2)
      ctx.lineTo(left + boxSize, top + boxSize / 2)
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(left + boxSize / 2, top)
      ctx.lineTo(left + boxSize / 2, top + boxSize)
      ctx.stroke()

      if (gridType === 'mi') {
        ctx.beginPath()
        ctx.moveTo(left, top)
        ctx.lineTo(left + boxSize, top + boxSize)
        ctx.moveTo(left + boxSize, top)
        ctx.lineTo(left, top + boxSize)
        ctx.stroke()
      }
    }
  }, [gridType])

  function position(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height }
  }
  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const { x, y } = position(event)
    canvas.setPointerCapture(event.pointerId)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    drawing.current = true
  }
  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const { x, y } = position(event)
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.lineTo(x, y)
    ctx.stroke()
  }
  function clear() {
    const canvas = canvasRef.current!
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
  }
  return <div className="draw-area">
    <div className="draw-head">
      <div className="draw-controls">
        <span>✏️ 田字格练字板</span>
        <div className="draw-grid-toggle">
          <button type="button" className={gridType === 'tian' ? 'active' : ''} onClick={() => setGridType('tian')}>田字格</button>
          <button type="button" className={gridType === 'mi' ? 'active' : ''} onClick={() => setGridType('mi')}>米字格</button>
        </div>
        <div className="draw-colors">
          {['#255e6c', '#e03e3e', '#1d88e5'].map((c) => (
            <button key={c} type="button" className={`color-dot ${color === c ? 'selected' : ''}`} style={{ backgroundColor: c }} onClick={() => setColor(c)} aria-label={`选择颜色 ${c}`} />
          ))}
        </div>
        <div className="draw-widths">
          {[4, 8, 14].map((w) => (
            <button key={w} type="button" className={`width-btn ${lineWidth === w ? 'selected' : ''}`} onClick={() => setLineWidth(w)}>
              {w === 4 ? '细' : w === 8 ? '中' : '粗'}
            </button>
          ))}
        </div>
      </div>
      <button className="text-button" onClick={clear} type="button"><Eraser size={17} /> 清空重写</button>
    </div>
    <div className="draw-canvas-wrapper">
      <canvas ref={bgCanvasRef} className="draw-bg-canvas" width={900} height={300} aria-hidden="true" />
      <canvas ref={canvasRef} className="draw-fg-canvas" width={900} height={300} aria-label="手写练习板" onPointerDown={start} onPointerMove={move} onPointerUp={() => { drawing.current = false }} onPointerCancel={() => { drawing.current = false }} />
    </div>
    <p>在田字格中用手指或鼠标工整书写，注意横平竖直。</p>
  </div>
}

function AnswerArea({ variant, selected, setSelected, numeric, setNumeric, ordered, setOrdered, tileCount, setTileCount, matched, setMatched }: {
  variant: AutoVariant
  selected: string
  setSelected: (value: string) => void
  numeric: string
  setNumeric: (value: string) => void
  ordered: string[]
  setOrdered: (value: string[]) => void
  tileCount: number
  setTileCount: (value: number) => void
  matched: Record<string, string>
  setMatched: (value: Record<string, string>) => void
}) {
  const [left, setLeft] = useState<string | null>(null)
  if (variant.kind === 'choice') {
    return <div className="answer-grid">{variant.options?.map((option, index) => <button key={`${option}-${index}`} type="button" className={`answer-option ${selected === option ? 'selected' : ''}`} onClick={() => setSelected(option)}><span className="option-letter">{String.fromCharCode(65 + index)}</span><span>{option}</span></button>)}</div>
  }
  if (variant.kind === 'number') {
    return <div className="number-answer"><span>我的答案</span><input aria-label="填写数字答案" type="number" inputMode="numeric" value={numeric} onChange={(event) => setNumeric(event.target.value)} placeholder="?" /><span className="number-spark">✦</span></div>
  }
  if (variant.kind === 'order') {
    const remaining = variant.items?.filter((item) => !ordered.includes(item)) ?? []
    return <div className="order-answer"><p>按顺序点击下面的卡片</p><div className="order-slots">{Array.from({ length: variant.items?.length ?? 0 }, (_, index) => <button key={index} type="button" className={`order-slot ${ordered[index] ? 'filled' : ''}`} onClick={() => setOrdered(ordered.slice(0, index))}>{ordered[index] || '？'}</button>)}</div><div className="order-options">{remaining.map((item) => <button key={item} type="button" onClick={() => setOrdered([...ordered, item])}>{item}</button>)}</div><button className="text-button" type="button" onClick={() => setOrdered([])}><RotateCcw size={16} /> 重新排列</button></div>
  }
  if (variant.kind === 'tiles') {
    return <div className="tiles-answer"><div className="tile-basket">{Array.from({ length: tileCount }, (_, index) => <span key={index}>{variant.icon || '⭐'}</span>)}{tileCount === 0 && <em>篮子还是空的</em>}</div><div className="tile-controls"><button type="button" onClick={() => setTileCount(Math.max(0, tileCount - 1))}>－ 拿走一颗</button><button type="button" onClick={() => setTileCount(Math.min(20, tileCount + 1))}>＋ 放进一颗</button></div></div>
  }
  if (variant.kind === 'match') {
    const pairs = variant.pairs ?? []
    return <div className="match-answer"><p>先选左边，再选右边，把它们连起来</p><div className="match-columns"><div>{pairs.map(({ left: item }) => <button type="button" key={item} className={left === item ? 'selected' : matched[item] ? 'matched' : ''} onClick={() => setLeft(item)}>{item}</button>)}</div><div>{[...pairs].reverse().map(({ right: item }) => <button type="button" key={item} onClick={() => { if (left) { setMatched({ ...matched, [left]: item }); setLeft(null) } }}>{item}</button>)}</div></div></div>
  }
  return null
}

export default function Challenge({ point, record, onAuto, onSelf, onBack, onNext, playAudio, muted, hasNext }: Props) {
  const [variantIndex] = useState(() => Math.min(record?.correctDays.length ?? 0, 2))
  const [selected, setSelected] = useState('')
  const [numeric, setNumeric] = useState('')
  const [ordered, setOrdered] = useState<string[]>([])
  const [tileCount, setTileCount] = useState(0)
  const [matched, setMatched] = useState<Record<string, string>>({})
  const [checked, setChecked] = useState<boolean[]>([])
  const [showExample, setShowExample] = useState(false)
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | 'self' | null>(null)
  const [showHint, setShowHint] = useState(false)
  const task = point.task
  const variant = task.mode === 'auto' ? task.variants[variantIndex] : null
  const audio = variant?.audio ?? (task.mode === 'self' ? task.audio : '')

  function canSubmit() {
    if (!variant) return false
    if (variant.kind === 'choice') return !!selected
    if (variant.kind === 'number') return numeric.trim() !== ''
    if (variant.kind === 'order') return ordered.length === variant.items?.length
    if (variant.kind === 'tiles') return tileCount > 0
    if (variant.kind === 'match') return Object.keys(matched).length === variant.pairs?.length
    return false
  }

  function submit() {
    if (!variant || !canSubmit() || feedback === 'correct') return
    let correct = false
    if (variant.kind === 'choice') correct = selected === variant.answer
    if (variant.kind === 'number') correct = Number(numeric) === variant.answer
    if (variant.kind === 'order') correct = JSON.stringify(ordered) === JSON.stringify(variant.answer)
    if (variant.kind === 'tiles') correct = tileCount === variant.answer
    if (variant.kind === 'match') correct = (variant.pairs ?? []).every((pair) => matched[pair.left] === pair.right)
    onAuto(correct)
    setFeedback(correct ? 'correct' : 'wrong')
    if (correct) fireConfetti()
    if (!correct) setShowHint(true)
    playAudio(correct ? 'audio/ui-correct.mp3' : 'audio/ui-try.mp3')
  }

  function finishSelf(rating: 'practiced' | 'confident') {
    onSelf(rating)
    setFeedback('self')
    fireConfetti()
    playAudio('audio/ui-star.mp3')
  }

  return <div className="challenge-page page-enter">
    <div className="challenge-top"><button className="back-link" type="button" onClick={onBack}><ArrowLeft size={19} /> 返回地图</button><span className="challenge-source">{point.source}</span></div>
    <div className="challenge-layout">
      <section className="challenge-card">
        <div className="challenge-meta"><span className={`pill ${task.mode === 'auto' ? 'pill-mint' : 'pill-peach'}`}>{task.mode === 'auto' ? '🧩 自动判分' : '🌱 自己试一试'}</span><span className="tiny-label">{point.type} · {point.level}</span></div>
        <div className="challenge-title-row"><div><p className="eyebrow">探险任务</p><h1>{point.name}</h1></div><button className="listen-button" type="button" onClick={() => playAudio(audio)} aria-label="播放题目语音" title={muted ? '当前已静音，请先在页面上方开启声音' : '听题目'}><Headphones size={24} /><span>听题目</span></button></div>
        {task.mode === 'auto' && <p className="challenge-instruction">{task.instruction}</p>}
        {task.mode === 'auto' && variant ? <>
          <div className="question-box"><span className="question-count">第 {variantIndex + 1} 种挑战</span><h2>{variant.prompt}</h2></div>
          <AnswerArea variant={variant} selected={selected} setSelected={setSelected} numeric={numeric} setNumeric={setNumeric} ordered={ordered} setOrdered={setOrdered} tileCount={tileCount} setTileCount={setTileCount} matched={matched} setMatched={setMatched} />
          {feedback === 'wrong' && <div className="feedback feedback-wrong"><HelpCircle size={21} /><div><strong>再试一次，你可以做到！</strong><p>{variant.hint}</p></div></div>}
          {showHint && feedback !== 'correct' && <button type="button" className="text-button hint-again" onClick={() => setShowHint(!showHint)}><Lightbulb size={17} /> 收起提示</button>}
          {!showHint && feedback !== 'correct' && <button type="button" className="text-button hint-again" onClick={() => setShowHint(true)}><Lightbulb size={17} /> 给我一点提示</button>}
          {showHint && feedback !== 'wrong' && feedback !== 'correct' && <div className="mini-hint">{variant.hint}</div>}
          {feedback === 'correct' ? <div className="feedback feedback-correct"><Sparkles size={25} /><div><strong>答对啦，这颗探险星记录了你的努力！</strong><p>{variant.explanation}</p><small>同一个知识点还会在之后的日子里用新题目复习。</small></div></div> : <button type="button" className="primary-button challenge-submit" disabled={!canSubmit()} onClick={submit}><Check size={20} /> 检查答案</button>}
        </> : task.mode === 'self' ? <>
          <div className="self-task-box"><span className="self-emoji">{task.kind === 'draw' ? '✏️' : task.kind === 'speak' ? '🎤' : '💡'}</span><div><strong>先来试一试</strong><p>{task.instruction}</p></div></div>
          <div className="knowledge-tip"><Lightbulb size={22} /><div><strong>今天的原创小练习</strong><p>{task.practice}</p></div></div>
          {task.kind === 'speak' && <SpeechTools text={task.practice} />}
          {task.kind === 'draw' && <DrawPad />}
          {task.originalTextNeeded && <div className="book-note">📖 想练习教材原文？可以翻到 <strong>{point.source}</strong>。这里的任务先帮你练习相同的能力。</div>}
          {!showExample && <button type="button" className="reveal-button" onClick={() => setShowExample(true)}>{task.kind === 'speak' ? '🎤 我已经大声说过了' : task.kind === 'draw' ? '✏️ 我已经写好啦' : '💭 我先自己想好了'} <ArrowRight size={19} /></button>}
          {showExample && <>
            <div className="knowledge-tip"><Lightbulb size={22} /><div><strong>知识小贴士</strong><p>{task.example}</p></div></div>
            <div className="checklist"><h2>完成后，自己检查一下</h2>{task.checklist.map((text, index) => <label key={index} className="check-row"><input type="checkbox" checked={!!checked[index]} onChange={(event) => setChecked((current) => { const next = [...current]; next[index] = event.target.checked; return next })} /><span className="check-square"><Check size={15} /></span><span>{text}</span></label>)}</div>
            {feedback === 'self' ? <div className="feedback feedback-correct"><Star size={24} /><div><strong>练习完成，星星属于你！</strong><p>这项记录来自你的自评。以后还可以再来练习。</p></div></div> : <div className="self-actions"><button type="button" className="secondary-button" onClick={() => finishSelf('practiced')}>今天练习了</button><button type="button" className="primary-button" disabled={!task.checklist.every((_, index) => checked[index])} onClick={() => finishSelf('confident')}>我会了（自评） <Sparkles size={18} /></button></div>}
          </>}
        </> : null}
        {(feedback === 'correct' || feedback === 'self') && <button type="button" className="primary-button next-button" onClick={onNext}>{hasNext ? '下一项探险任务' : '返回探险地图'} <ArrowRight size={20} /></button>}
      </section>
      <aside className="challenge-side">
        <div className={`buddy-face ${feedback === 'correct' || feedback === 'self' ? 'celebrating' : feedback === 'wrong' ? 'encouraging' : ''}`}>
          <span className="buddy-eye eye-one" />
          <span className="buddy-eye eye-two" />
          <span className="buddy-smile" />
        </div>
        <div className="buddy-speech">
          <strong>小岛伙伴说</strong>
          <p>
            {feedback === 'correct'
              ? '太棒啦！你答对了，真是聪明的小探险家！✨'
              : feedback === 'self'
              ? '太精彩了！练习完成，为你鼓掌！⭐'
              : feedback === 'wrong'
              ? '没关系，看一看下面的小提示，我们再试一次！💪'
              : '慢慢想，勇敢试。每一次练习，都是向前走一步！'}
          </p>
        </div>
        <div className="side-progress">
          <span>知识点编号</span>
          <strong>{point.id}</strong>
          <span>学习记录</span>
          <strong>{record?.correctDays.length ? `正确练习 ${record.correctDays.length}/3 天` : record?.selfRating ? record.selfRating === 'confident' ? '自评会了' : '已练习' : '还未练习'}</strong>
        </div>
      </aside>
    </div>
  </div>
}
