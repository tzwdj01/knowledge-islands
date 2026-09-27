import { useEffect, useState } from 'react'
import { Heart, Sparkles, Star, Utensils, X } from 'lucide-react'
import type { PetState } from './types'

interface Props {
  pet: PetState
  availableStars: number
  onFeed: () => boolean
  onBuyBamboo: (count: 1 | 3) => void
  onClose: () => void
}

export default function PetModal({ pet, availableStars, onFeed, onBuyBamboo, onClose }: Props) {
  const [message, setMessage] = useState('我在这里陪你探险，想来玩的时候再来找我吧！')
  const [animation, setAnimation] = useState<'idle' | 'eating' | 'happy'>('idle')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function feed() {
    if (pet.bamboo <= 0) {
      setMessage('竹子吃完啦。先去完成喜欢的小任务，收集星星再来小铺看看。')
      return
    }
    const leveledUp = onFeed()
    setAnimation('eating')
    setMessage(leveledUp ? '谢谢你！我们一起升到新等级啦！' : '嚼嚼嚼，脆脆的竹子真好吃！谢谢你的陪伴。')
    window.setTimeout(() => setAnimation('idle'), 1000)
  }

  function buy(count: 1 | 3) {
    const cost = count === 3 ? 5 : 2
    if (availableStars < cost) {
      setMessage(`还差 ${cost - availableStars} 颗星星。先去完成一项小任务吧。`)
      return
    }
    onBuyBamboo(count)
    setMessage(`兑换成功！花花的小竹篮里多了 ${count} 根竹子。`)
    setAnimation('happy')
    window.setTimeout(() => setAnimation('idle'), 900)
  }

  return <div className="modal-backdrop pet-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="pet-modal-card page-enter" role="dialog" aria-modal="true" aria-labelledby="pet-modal-title">
      <header className="pet-modal-header">
        <div><span className="eyebrow">探险伙伴</span><h2 id="pet-modal-title">熊猫花花 <span className="pet-level-chip">Lv.{pet.level}</span></h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="关闭花花小屋"><X size={21} /></button>
      </header>
      <div className={`pet-stage ${animation}`}>
        <div className="pet-sparkle sparkle-one">✦</div><div className="pet-sparkle sparkle-two">✧</div>
        <div className="pet-panda" aria-label="熊猫花花" role="img">🐼</div>
        <div className="pet-message" aria-live="polite">{message}</div>
      </div>
      <div className="pet-progress-row"><div><span>成长经验</span><strong>{pet.experience}/100</strong></div><span className="pet-progress-track"><i style={{ width: `${pet.experience}%` }} /></span><small>喂花花一根竹子，可增加 25 点经验。这里没有每日任务，想来就来。</small></div>
      <div className="pet-inventory"><span>🎋 竹子：<strong>{pet.bamboo}</strong></span><span>🍃 一起吃过：<strong>{pet.fedCount}</strong> 根</span><span><Star size={16} fill="currentColor" /> 可用星星：<strong>{availableStars}</strong></span></div>
      <div className="pet-actions"><button type="button" className="primary-button" onClick={feed} disabled={pet.bamboo <= 0}><Utensils size={18} />喂花花一根竹子</button><button type="button" className="secondary-button" onClick={() => setMessage('拍拍手，花花也会为你的每一次尝试加油！')}><Heart size={18} />说声你好</button></div>
      <div className="pet-shop">
        <div className="pet-shop-heading"><div><h3>竹子小铺</h3><p>用探险星兑换小礼物，不影响学习进度。</p></div><Sparkles size={21} /></div>
        <div className="pet-shop-options"><button type="button" className="pet-shop-item" disabled={availableStars < 2} onClick={() => buy(1)}><span>🎋</span><strong>1 根竹子</strong><small>2 颗星</small></button><button type="button" className="pet-shop-item featured" disabled={availableStars < 5} onClick={() => buy(3)}><span>🎋🎋🎋</span><strong>竹子小礼包</strong><small>3 根 · 5 颗星</small></button></div>
      </div>
    </section>
  </div>
}
