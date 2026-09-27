// Lightweight, zero-dependency canvas confetti engine for celebratory positive feedback

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  rotation: number
  rotationSpeed: number
  shape: 'circle' | 'rect' | 'star'
  alpha: number
}

const COLORS = ['#ff5964', '#fec601', '#20bf55', '#01baef', '#a370f7', '#ff8fab']

export function fireConfetti(durationMs = 2200): () => void {
  const canvas = document.createElement('canvas')
  canvas.style.position = 'fixed'
  canvas.style.top = '0'
  canvas.style.left = '0'
  canvas.style.width = '100vw'
  canvas.style.height = '100vh'
  canvas.style.pointerEvents = 'none'
  canvas.style.zIndex = '9999'
  document.body.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    canvas.remove()
    return () => {}
  }

  let width = (canvas.width = window.innerWidth)
  let height = (canvas.height = window.innerHeight)

  const onResize = () => {
    width = canvas.width = window.innerWidth
    height = canvas.height = window.innerHeight
  }
  window.addEventListener('resize', onResize)

  const particles: Particle[] = []
  const count = 55

  for (let i = 0; i < count; i++) {
    particles.push({
      x: width * (0.35 + Math.random() * 0.3),
      y: height * 0.45,
      vx: (Math.random() - 0.5) * 16,
      vy: -Math.random() * 12 - 4,
      size: Math.random() * 8 + 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 10,
      shape: Math.random() > 0.5 ? 'circle' : Math.random() > 0.5 ? 'star' : 'rect',
      alpha: 1,
    })
  }

  let animationId: number
  const startTime = performance.now()

  function drawStar(c: CanvasRenderingContext2D, r: number) {
    c.beginPath()
    for (let i = 0; i < 5; i++) {
      c.lineTo(Math.cos(((18 + i * 72) * Math.PI) / 180) * r, -Math.sin(((18 + i * 72) * Math.PI) / 180) * r)
      c.lineTo(Math.cos(((54 + i * 72) * Math.PI) / 180) * (r / 2), -Math.sin(((54 + i * 72) * Math.PI) / 180) * (r / 2))
    }
    c.closePath()
    c.fill()
  }

  function frame(now: number) {
    const elapsed = now - startTime
    if (elapsed > durationMs) {
      cleanup()
      return
    }

    ctx!.clearRect(0, 0, width, height)

    for (const p of particles) {
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.35 // gravity
      p.vx *= 0.98 // air resistance
      p.rotation += p.rotationSpeed
      p.alpha = Math.max(0, 1 - elapsed / durationMs)

      ctx!.save()
      ctx!.translate(p.x, p.y)
      ctx!.rotate((p.rotation * Math.PI) / 180)
      ctx!.globalAlpha = p.alpha
      ctx!.fillStyle = p.color

      if (p.shape === 'circle') {
        ctx!.beginPath()
        ctx!.arc(0, 0, p.size / 2, 0, Math.PI * 2)
        ctx!.fill()
      } else if (p.shape === 'star') {
        drawStar(ctx!, p.size)
      } else {
        ctx!.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
      }

      ctx!.restore()
    }

    animationId = requestAnimationFrame(frame)
  }

  animationId = requestAnimationFrame(frame)

  function cleanup() {
    cancelAnimationFrame(animationId)
    window.removeEventListener('resize', onResize)
    if (canvas.parentNode) canvas.remove()
  }

  return cleanup
}
