import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, ArrowLeft, ArrowRight, Award, BookOpen, Check, ChevronRight, CloudDownload, Compass, Download, Headphones, Home, Lightbulb, Map, Menu, Printer, RotateCcw, Settings, ShieldCheck, Sparkles, Star, TrendingUp, Upload, Volume2, VolumeX, X } from 'lucide-react'
import Challenge from './Challenge'
import AiSettings from './AiSettings'
import { catalog, lessonsById, pointsById, pointsForUnit, pointsForVolume, unitsById, volumesById } from './lib/data'
import { clearMistake, freshState, getBadges, isDue, loadState, mistakePoints, pointStage, recommendation, recordAuto, recordSelf, saveState, totalStars, validateState, volumeStats } from './lib/progress'
import type { GameState, Point, Volume, VolumeId } from './types'

type View = 'home' | 'island' | 'unit' | 'challenge' | 'review' | 'progress' | 'settings'
type OfflineStatus = 'preparing' | 'ready' | 'unsupported' | 'preview'

const themes: Record<VolumeId, { place: string; icon: string; className: string; subtitle: string }> = {
  YW1: { place: '拼音森林', icon: '🌳', className: 'forest', subtitle: '从拼音和汉字出发' },
  YW2: { place: '故事云岛', icon: '☁️', className: 'cloud', subtitle: '读故事，表达想法' },
  SX1: { place: '数字沙滩', icon: '🏖️', className: 'beach', subtitle: '数一数，算一算' },
  SX2: { place: '智慧山谷', icon: '⛰️', className: 'valley', subtitle: '口诀、图形与生活数学' },
}

function stageText(point: Point, state: GameState) {
  const stage = pointStage(point, state)
  if (stage === 'mastered') return '已掌握'
  if (stage === 'confident') return '自评会了'
  if (stage === 'practiced') return '已练习'
  return '未开始'
}

function stageClass(point: Point, state: GameState) {
  return `status-${pointStage(point, state)}`
}

function VolumeCard({ volume, state, onClick }: { volume: Volume; state: GameState; onClick: () => void }) {
  const theme = themes[volume.id]
  const stats = volumeStats(state, volume.id)
  const percent = Math.round(stats.practiced / stats.total * 100)
  return <button type="button" className={`island-card ${theme.className}`} onClick={onClick}>
    <div className="island-card-top"><span className="island-icon">{theme.icon}</span><span className="island-badge">{volume.grade} · {volume.subject}</span></div>
    <div className="island-card-copy"><span className="card-kicker">探索区域 {volume.id}</span><h3>{theme.place}</h3><p>{theme.subtitle}</p></div>
    <div className="card-progress"><div><span>探索进度</span><strong>{stats.practiced}/{stats.total}</strong></div><div className="progress-track"><span style={{ width: `${percent}%` }} /></div></div>
    <div className="island-card-arrow"><ArrowRight size={20} /></div>
  </button>
}

function TaskRow({ point, state, onClick, index }: { point: Point; state: GameState; onClick: () => void; index?: number }) {
  return <button type="button" className="task-row" onClick={onClick}>
    <span className="task-row-number">{index ? String(index).padStart(2, '0') : point.task.mode === 'auto' ? '🧩' : '🌱'}</span>
    <span className="task-row-text"><strong>{point.name}</strong><small>{point.type} · {point.task.mode === 'auto' ? '答题闯关' : '动手自查'}</small></span>
    <span className={`status-pill ${stageClass(point, state)}`}>{stageText(point, state)}</span>
    <ChevronRight size={19} className="task-chevron" />
  </button>
}

function OfflineBadge({ status }: { status: OfflineStatus }) {
  return <span className={`offline-badge ${status}`}><span className="offline-dot" />{status === 'ready' ? '可离线使用' : status === 'preparing' ? '正在准备离线资源' : status === 'preview' ? '本地预览' : '需 HTTPS 安装'}</span>
}

export default function App() {
  const [state, setState] = useState<GameState>(loadState)
  const [view, setView] = useState<View>('home')
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)
  const [currentPointId, setCurrentPointId] = useState<string | null>(null)
  const [backView, setBackView] = useState<View>('home')
  const [queue, setQueue] = useState<string[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const [offlineStatus, setOfflineStatus] = useState<OfflineStatus>(import.meta.env.DEV ? 'preview' : 'preparing')
  const [storageWarning, setStorageWarning] = useState(false)
  const [notice, setNotice] = useState('')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [reviewTab, setReviewTab] = useState<'due' | 'mistakes'>('due')
  const [showEyeCare, setShowEyeCare] = useState(false)
  const [printUnitId, setPrintUnitId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const activeVolume = volumesById.get(state.activeVolume)!
  const activeTheme = themes[state.activeVolume]
  const dailyTasks = useMemo(() => recommendation(state), [state])
  const mistakes = useMemo(() => mistakePoints(state), [state])
  const badges = useMemo(() => getBadges(state), [state])
  const currentPoint = currentPointId ? pointsById.get(currentPointId) : undefined
  const selectedUnit = selectedUnitId ? unitsById.get(selectedUnitId) : undefined

  useEffect(() => {
    const timer = window.setInterval(() => {
      setShowEyeCare(true)
    }, 20 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => { if (!saveState(state)) setStorageWarning(true) }, [state])
  useEffect(() => {
    if (import.meta.env.DEV) return
    if (!('serviceWorker' in navigator) || !window.isSecureContext) { setOfflineStatus('unsupported'); return }
    const expectedVersion = document.querySelector<HTMLMetaElement>('meta[name="offline-version"]')?.content
    const onMessage = (event: MessageEvent) => {
      if ((event.data?.type === 'OFFLINE_READY' || event.data?.type === 'OFFLINE_STATUS' && event.data.ready) && event.data.version === expectedVersion) setOfflineStatus('ready')
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then((registration) => {
      const check = () => registration.active?.postMessage({ type: 'CHECK_OFFLINE' })
      if (registration.active) check()
      navigator.serviceWorker.addEventListener('controllerchange', check)
    }).catch(() => setOfflineStatus('unsupported'))
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 4500)
    return () => window.clearTimeout(timer)
  }, [notice])

  const playAudio = useCallback((path: string) => {
    if (state.muted || !path) return
    try {
      audioRef.current?.pause()
      const audio = new Audio(`${import.meta.env.BASE_URL}${path}`)
      audioRef.current = audio
      void audio.play().catch(() => setNotice('声音暂时无法播放，可以先看屏幕上的文字。'))
    } catch { setNotice('声音暂时无法播放，可以先看屏幕上的文字。') }
  }, [state.muted])

  function navigate(next: View) {
    setView(next)
    setMobileMenu(false)
    window.scrollTo(0, 0)
  }
  function selectVolume(id: VolumeId) {
    setState((current) => ({ ...current, activeVolume: id }))
    setSelectedUnitId(null)
    navigate('island')
  }
  function openTask(id: string, origin: View = view) {
    setCurrentPointId(id)
    setQueue([])
    setQueueIndex(0)
    setBackView(origin)
    navigate('challenge')
  }
  function startDaily(tasks = dailyTasks) {
    if (!tasks.length) { setNotice('今天的路线已经走完啦，去地图自由探险吧！'); return }
    setQueue(tasks.map((task) => task.id))
    setQueueIndex(0)
    setCurrentPointId(tasks[0].id)
    setBackView(view)
    navigate('challenge')
  }
  function nextTask() {
    if (queue.length && queueIndex + 1 < queue.length) {
      setQueueIndex(queueIndex + 1)
      setCurrentPointId(queue[queueIndex + 1])
      window.scrollTo(0, 0)
    } else {
      setQueue([])
      setCurrentPointId(null)
      navigate(backView)
    }
  }
  function exportProgress() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `知识探险岛-进度-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    setNotice('进度文件已导出，请妥善保存。')
  }
  async function importProgress(file?: File) {
    if (!file) return
    try {
      const imported = validateState(JSON.parse(await file.text()))
      if (!imported) throw new Error('invalid')
      setState(imported)
      setNotice('进度已导入成功！')
    } catch { setNotice('这个文件不是有效的知识探险岛进度文件。') }
    if (importRef.current) importRef.current.value = ''
  }
  function resetProgress() {
    if (!window.confirm('确定清空这个设备上的全部学习进度吗？此操作无法撤销。建议先导出备份。')) return
    setState(freshState())
    setNotice('进度已清空，可以重新出发啦。')
  }

  return <div className="app-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <header className="site-header"><div className="header-inner"><button type="button" className="brand" onClick={() => navigate('home')}><span className="brand-mark">✦</span><span><strong>知识探险岛</strong><small>每天学一点，快乐多一点</small></span></button>
      <nav className={`desktop-nav ${mobileMenu ? 'mobile-open' : ''}`} aria-label="主导航">
        <button type="button" className={view === 'home' ? 'active' : ''} onClick={() => navigate('home')}><Home size={18} />首页</button>
        <button type="button" className={view === 'island' || view === 'unit' ? 'active' : ''} onClick={() => navigate('island')}><Map size={18} />探险地图</button>
        <button type="button" className={view === 'review' ? 'active' : ''} onClick={() => navigate('review')}><RotateCcw size={18} />复习站</button>
        <button type="button" className={view === 'progress' ? 'active' : ''} onClick={() => navigate('progress')}><TrendingUp size={18} />我的成长</button>
      </nav>
      <div className="header-actions"><span className="star-counter"><Star size={18} fill="currentColor" />{totalStars(state)}</span><button type="button" className="icon-button desktop-settings" aria-label="家长设置" onClick={() => navigate('settings')}><Settings size={21} /></button><button type="button" className="icon-button mobile-menu-button" aria-label="打开菜单" onClick={() => setMobileMenu(!mobileMenu)}><Menu size={22} /></button></div></div></header>

    <main className="main-content">
      {view === 'home' && <div className="page-enter">
        <section className="hero"><div className="hero-copy"><span className="hero-kicker"><Sparkles size={17} /> 小小探险家，准备好了吗？</span><h1>把学习变成<br /><em>一场奇妙探险！</em></h1><p>跟着小岛伙伴，学语文、玩数学。每天完成几个小任务，慢慢发现自己的进步。</p><div className="hero-buttons"><button type="button" className="primary-button" onClick={() => startDaily()}><Compass size={20} /> 开始今天的探险 <ArrowRight size={19} /></button><button type="button" className="secondary-button" onClick={() => navigate('island')}>看看四座小岛</button></div><div className="hero-facts"><span><Check size={15} /> 每次约 5 个任务</span><span><Check size={15} /> 没有倒计时</span><span><Check size={15} /> 可以反复练习</span></div></div><div className="hero-art" aria-hidden="true"><span className="float-star star-a">✦</span><span className="float-star star-b">✧</span><span className="float-cloud cloud-a">☁</span><span className="float-cloud cloud-b">☁</span><div className="island-illustration"><div className="hill hill-back" /><div className="hill hill-front" /><div className="tree tree-left">🌳</div><div className="tree tree-right">🌴</div><div className="mascot"><span className="mascot-eye left" /><span className="mascot-eye right" /><span className="mascot-mouth" /></div><span className="island-flag">★</span></div><div className="hero-wave" /></div></section>
        <section className="section islands-section"><div className="section-heading"><div><span className="eyebrow">探索世界</span><h2>选择你的探险小岛</h2><p>想去哪里，就从哪里开始。每座岛都有不同的惊喜。</p></div><button type="button" className="section-link" onClick={() => navigate('island')}>查看完整地图 <ArrowRight size={17} /></button></div><div className="island-grid">{catalog.volumes.map((volume) => <VolumeCard key={volume.id} volume={volume} state={state} onClick={() => selectVolume(volume.id)} />)}</div></section>
        <section className="section daily-section"><div className="daily-panel"><div className="daily-copy"><span className="eyebrow">今日小路线</span><h2>准备好收集今天的星星了吗？</h2><p>先复习要记住的内容，再学一点新知识。答错也没关系，我们一起再试一次。</p><button type="button" className="primary-button" onClick={() => startDaily()}><Star size={19} /> 开始 5 个小任务</button></div><div className="daily-list"><div className="daily-list-head"><span>{activeTheme.icon} {activeTheme.place}</span><small>推荐路线</small></div>{dailyTasks.map((point, index) => <TaskRow key={point.id} point={point} state={state} index={index + 1} onClick={() => openTask(point.id, 'home')} />)}{dailyTasks.length === 0 && <p className="empty-copy">今天的路线已经走完啦！</p>}</div></div></section>
      </div>}

      {view === 'island' && <div className="page-enter"><div className="page-heading"><div><span className="eyebrow">探险地图</span><h1>今天想去哪座岛？</h1><p>四座小岛，装着语文和数学里的新发现。</p></div><OfflineBadge status={offlineStatus} /></div><div className="volume-switch">{catalog.volumes.map((volume) => <button type="button" key={volume.id} className={state.activeVolume === volume.id ? 'selected' : ''} onClick={() => setState((current) => ({ ...current, activeVolume: volume.id }))}>{themes[volume.id].icon} {volume.subject}{volume.grade}</button>)}</div><div className={`map-banner ${activeTheme.className}`}><div><span className="map-small-label">当前岛屿 · {activeVolume.id}</span><h2>{activeTheme.icon} {activeTheme.place}</h2><p>{activeTheme.subtitle} · {activeVolume.edition}</p><span className="map-progress">已探索 {volumeStats(state, activeVolume.id).practiced} / {volumeStats(state, activeVolume.id).total} 个知识点</span></div><div className="banner-orbit" aria-hidden="true"><span>✦</span></div></div><div className="section-heading map-section-title"><div><span className="eyebrow">探险路线</span><h2>从一个小区域开始</h2><p>可以按顺序走，也可以选择感兴趣的地方。</p></div></div><div className="unit-grid">{activeVolume.unitIds.map((id, index) => { const unit = unitsById.get(id)!; const points = pointsForUnit(id); const practiced = points.filter((point) => pointStage(point, state) !== 'new').length; return <button type="button" key={id} className="unit-card" onClick={() => { setSelectedUnitId(id); navigate('unit') }}><span className="unit-index">{String(index + 1).padStart(2, '0')}</span><span className="unit-card-icon">{['🧭','🌿','⭐','🏡','🪁','🔍','🌈','🎒','🏆','🎨'][index % 10]}</span><strong>{unit.name}</strong><small>{unit.lessonIds.length} 课 · {points.length} 个知识点</small><span className="unit-progress-line"><i style={{ width: `${practiced / points.length * 100}%` }} /></span><span className="unit-card-footer">{practiced}/{points.length} 已探索 <ChevronRight size={18} /></span></button> })}</div></div>}

      {view === 'unit' && selectedUnit && <div className="page-enter"><button type="button" className="back-link page-back" onClick={() => navigate('island')}><ArrowLeft size={19} /> 返回{activeTheme.place}</button><div className="unit-hero"><span className="eyebrow">{activeTheme.icon} {activeTheme.place} · 学习区域</span><h1>{selectedUnit.name}</h1><p>{selectedUnit.goal}</p><div className="unit-hero-meta"><span><BookOpen size={17} /> {selectedUnit.lessonIds.length} 课</span><span><Star size={17} /> {pointsForUnit(selectedUnit.id).length} 项任务</span><button type="button" className="unit-print-action" onClick={() => setPrintUnitId(selectedUnit.id)}><Printer size={16} /> 打印本单元练习单 (A4)</button></div></div><div className="lesson-list">{selectedUnit.lessonIds.map((id, index) => { const lesson = lessonsById.get(id)!; const points = lesson.pointIds.map((pointId) => pointsById.get(pointId)!); const done = points.filter((point) => pointStage(point, state) !== 'new').length; return <section key={id} className="lesson-card"><div className="lesson-head"><span className="lesson-number">{index + 1}</span><div><span className="card-kicker">第 {index + 1} 站 {lesson.page ? `· 教材 P${lesson.page}` : ''}</span><h2>{lesson.name}</h2></div><span className="lesson-count">{done}/{points.length} 已探索</span></div><div className="lesson-tasks">{points.map((point) => <TaskRow key={point.id} point={point} state={state} onClick={() => openTask(point.id, 'unit')} />)}</div></section> })}</div></div>}

      {view === 'challenge' && currentPoint && <Challenge key={currentPoint.id} point={currentPoint} record={state.records[currentPoint.id]} onAuto={(correct) => setState((current) => recordAuto(current, currentPoint.id, correct))} onSelf={(rating) => setState((current) => recordSelf(current, currentPoint.id, rating))} onBack={() => navigate(backView)} onNext={nextTask} playAudio={playAudio} muted={state.muted} hasNext={queue.length > 0 && queueIndex + 1 < queue.length} />}

      {view === 'review' && <div className="page-enter"><div className="page-heading"><div><span className="eyebrow">复习站</span><h1>让记忆更牢固 ✨</h1><p>学过的东西，隔几天再试一次，就会越来越熟练。</p></div><div className="round-illustration">🔁</div></div>
        <div className="review-tabs">
          <button type="button" className={`review-tab-btn ${reviewTab === 'due' ? 'active' : ''}`} onClick={() => setReviewTab('due')}><RotateCcw size={17} /> 艾宾浩斯复习 ({pointsForVolume(state.activeVolume).filter((point) => isDue(point, state)).length})</button>
          <button type="button" className={`review-tab-btn ${reviewTab === 'mistakes' ? 'active' : ''}`} onClick={() => setReviewTab('mistakes')}><AlertCircle size={17} /> 错题回顾本 ({mistakes.length})</button>
        </div>
        {reviewTab === 'due' ? <>
          <div className="review-note"><Lightbulb size={23} /><p>自动判分的任务会在不同日期换题复习，连续三次正确才会显示“已掌握”。口语和写字保留自评记录。</p></div>
          <div className="review-list"><div className="section-heading"><div><span className="eyebrow">{activeTheme.icon} {activeTheme.place}</span><h2>今天可以复习这些</h2></div></div>{pointsForVolume(state.activeVolume).filter((point) => isDue(point, state)).length ? pointsForVolume(state.activeVolume).filter((point) => isDue(point, state)).map((point) => <TaskRow key={point.id} point={point} state={state} onClick={() => openTask(point.id, 'review')} />) : <div className="empty-panel"><span>🎉</span><h3>今天的复习完成啦！</h3><p>也可以去地图自由探索新知识。</p><button className="secondary-button" type="button" onClick={() => navigate('island')}>去探险地图 <ArrowRight size={17} /></button></div>}</div>
        </> : <>
          <div className="review-note"><Lightbulb size={23} /><p>错题本自动收录练习中答错的知识点。重新挑战成功后，知识点将进一步加深掌握。</p></div>
          <div className="review-list"><div className="section-heading"><div><span className="eyebrow">重点攻克</span><h2>我的错题本</h2></div></div>{mistakes.length ? <div className="mistakes-container">{mistakes.map((point) => <div key={point.id} className="mistake-item"><div className="mistake-item-info"><span className="mistake-badge">错题 {state.records[point.id]?.wrongCount || 1} 次</span><strong>{point.name}</strong><small>{point.source} · {point.type}</small></div><div className="mistake-item-actions"><button type="button" className="primary-button mistake-btn" onClick={() => openTask(point.id, 'review')}>重新挑战</button><button type="button" className="text-button" onClick={() => setState((curr) => clearMistake(curr, point.id))}>移出</button></div></div>)}</div> : <div className="empty-panel"><span>🌟</span><h3>目前没有错题记录！</h3><p>真棒！思维敏捷，做题细心，继续保持探险好状态！</p><button className="secondary-button" type="button" onClick={() => navigate('island')}>去探险地图 <ArrowRight size={17} /></button></div>}</div>
        </>}
      </div>}

      {view === 'progress' && <div className="page-enter"><div className="page-heading"><div><span className="eyebrow">我的成长</span><h1>每一点进步，都闪闪发光</h1><p>星星记录了你的努力；“已掌握”和“自评会了”分开统计。</p></div><div className="round-illustration">🏅</div></div>
        <div className="stats-grid"><div className="stat-card yellow"><span>⭐ 收集的星星</span><strong>{totalStars(state)}</strong><small>每天完成任务都能获得</small></div><div className="stat-card green"><span>🌱 探索过的知识点</span><strong>{catalog.points.filter((point) => pointStage(point, state) !== 'new').length}</strong><small>共 {catalog.points.length} 个知识点</small></div><div className="stat-card blue"><span>🧩 自动判定掌握</span><strong>{catalog.points.filter((point) => pointStage(point, state) === 'mastered').length}</strong><small>不同日期三次正确</small></div><div className="stat-card peach"><span>💬 自评会了</span><strong>{catalog.points.filter((point) => pointStage(point, state) === 'confident').length}</strong><small>朗读、表达与动手练习</small></div></div>
        <div className="badges-section"><div className="section-heading"><div><span className="eyebrow">探险荣耀</span><h2>探险家成就勋章</h2><p>每一次突破，都能点亮一颗闪耀的勋章。</p></div><span className="badge-stat-pill"><Award size={16} /> 已解锁 {badges.filter(b => b.unlocked).length} / {badges.length}</span></div><div className="badges-grid">{badges.map((badge) => <div key={badge.id} className={`badge-card ${badge.unlocked ? 'unlocked' : 'locked'}`}><span className="badge-icon">{badge.icon}</span><div className="badge-info"><strong>{badge.name}</strong><p>{badge.desc}</p><span className="badge-progress">{badge.unlocked ? '✨ 已达成' : `进度: ${badge.progressText}`}</span></div></div>)}</div></div>
        <div className="progress-volumes"><div className="section-heading"><div><span className="eyebrow">小岛足迹</span><h2>四座小岛的进度</h2></div></div>{catalog.volumes.map((volume) => { const stats = volumeStats(state, volume.id); return <button type="button" className="volume-progress-row" key={volume.id} onClick={() => selectVolume(volume.id)}><span className="volume-progress-icon">{themes[volume.id].icon}</span><span className="volume-progress-info"><strong>{themes[volume.id].place}</strong><small>{volume.grade} · {volume.subject} · {stats.mastered} 项自动掌握 / {stats.confident} 项自评会了</small><span className="progress-track"><i style={{ width: `${stats.practiced / stats.total * 100}%` }} /></span></span><span className="volume-progress-count">{stats.practiced}/{stats.total}</span><ChevronRight size={20} /></button> })}</div></div>}

      {view === 'settings' && <div className="page-enter settings-page"><div className="page-heading"><div><span className="eyebrow">家长设置</span><h1>把小岛照顾得更好</h1><p>学习数据只保存在当前设备，不需要账号。</p></div><div className="round-illustration">⚙️</div></div><div className="settings-grid"><AiSettings /><section className="settings-card"><div className="settings-icon mint"><Headphones size={26} /></div><h2>声音设置</h2><p>题目普通话语音已随游戏打包。孩子可以点“听题目”反复听。</p><button type="button" className="secondary-button" onClick={() => setState((current) => ({ ...current, muted: !current.muted }))}>{state.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}{state.muted ? '已静音，点击开启' : '声音已开启，点击静音'}</button></section><section className="settings-card"><div className="settings-icon yellow"><CloudDownload size={26} /></div><h2>离线使用</h2><p>首次在 HTTPS 网页打开后，等全部任务与语音下载完成，再将网页添加到主屏幕。</p><OfflineBadge status={offlineStatus} /><small>当前版本无需登录；在家长设置里可备份进度。</small></section><section className="settings-card"><div className="settings-icon blue"><ShieldCheck size={26} /></div><h2>进度备份</h2><p>换设备前先导出文件，再在新设备上导入。文件只由你保管。</p><div className="settings-buttons"><button type="button" className="secondary-button" onClick={exportProgress}><Download size={18} /> 导出进度</button><button type="button" className="secondary-button" onClick={() => importRef.current?.click()}><Upload size={18} /> 导入进度</button><input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(event) => void importProgress(event.target.files?.[0])} /></div></section><section className="settings-card"><div className="settings-icon peach"><RotateCcw size={26} /></div><h2>重新开始</h2><p>清空这个设备上的学习记录。建议先导出备份。</p><button type="button" className="danger-button" onClick={resetProgress}>清空全部进度</button></section></div></div>}
    </main>
    {showEyeCare && (
      <div className="modal-backdrop">
        <div className="eyecare-modal">
          <div className="eyecare-icon">🌿</div>
          <h2>小眼睛休息一下吧！</h2>
          <p>小探险家已经连续学习 20 分钟啦。看一看远处的窗外和大树，做做眼保健操，保护明亮清澈的眼睛！</p>
          <button type="button" className="primary-button" onClick={() => setShowEyeCare(false)}>
            我知道啦，做做操休息会儿
          </button>
        </div>
      </div>
    )}
    {printUnitId && (() => {
      const pUnit = unitsById.get(printUnitId)
      if (!pUnit) return null
      const pVolume = volumesById.get(pUnit.volumeId)!
      const pPoints = pointsForUnit(pUnit.id)
      return (
        <div className="modal-backdrop print-modal-backdrop">
          <div className="print-modal">
            <div className="print-modal-header no-print">
              <div>
                <strong>A4 练习单预览 · {pUnit.name}</strong>
                <small>（支持一键打印或另存为 PDF）</small>
              </div>
              <div className="print-modal-actions">
                <button type="button" className="primary-button" onClick={() => window.print()}>
                  <Printer size={18} /> 立即打印
                </button>
                <button type="button" className="icon-button" onClick={() => setPrintUnitId(null)} aria-label="关闭">
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="printable-sheet">
              <div className="print-sheet-head">
                <h1>{pVolume.subject}（{pVolume.grade}）· {pUnit.name} 知识探险练习单</h1>
                <div className="print-sheet-meta">
                  <span>班级：___________</span>
                  <span>姓名：___________</span>
                  <span>学号：___________</span>
                  <span>用时：_____ 分钟</span>
                </div>
              </div>
              <div className="print-sheet-body">
                {pPoints.map((pt, idx) => (
                  <div key={pt.id} className="print-question">
                    <div className="print-q-title">
                      <strong>第 {idx + 1} 题【{pt.name}】</strong>
                      <span className="print-q-level">（{pt.type} · {pt.level}）</span>
                    </div>
                    <p className="print-q-desc">
                      {pt.task.mode === 'auto' ? pt.task.variants[0]?.prompt : pt.task.practice}
                    </p>
                    {pt.task.mode === 'auto' && pt.task.variants[0]?.options && (
                      <div className="print-q-options">
                        {pt.task.variants[0].options.map((opt, oIdx) => (
                          <span key={oIdx} className="print-option-item">
                            {String.fromCharCode(65 + oIdx)}. {opt}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="print-answer-line">答题区 / 思考痕迹：_____________________________________________________</div>
                  </div>
                ))}
              </div>
              <div className="print-sheet-foot">
                <span>✦ 知识探险岛 · 陪伴好习惯的每一天</span>
              </div>
            </div>
          </div>
        </div>
      )
    })()}
    {storageWarning && <div className="storage-warning">浏览器没有保存进度。请检查是否在无痕模式，或设备存储是否已满。</div>}
    {notice && <div className="toast" role="status">{notice}</div>}
    <footer className="site-footer"><span>✦ 知识探险岛</span><span>每一次尝试，都值得一颗星。</span><button type="button" onClick={() => navigate('settings')}>家长设置 <Settings size={15} /></button></footer>
    <div className="mobile-bottom-nav"><button type="button" className={view === 'home' ? 'active' : ''} onClick={() => navigate('home')}><Home size={20} /><span>首页</span></button><button type="button" className={view === 'island' || view === 'unit' ? 'active' : ''} onClick={() => navigate('island')}><Map size={20} /><span>地图</span></button><button type="button" className={view === 'review' ? 'active' : ''} onClick={() => navigate('review')}><RotateCcw size={20} /><span>复习</span></button><button type="button" className={view === 'progress' ? 'active' : ''} onClick={() => navigate('progress')}><TrendingUp size={20} /><span>成长</span></button></div>
  </div>
}
