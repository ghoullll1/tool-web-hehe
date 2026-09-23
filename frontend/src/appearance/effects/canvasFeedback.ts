// Adapted from React Bits ClickSpark and ElectricBorder. One event-driven canvas, no idle RAF.
const primary = '.workbench button:not([role="option"]),.appearance-segment button,.studio-directory-view button'
const active = '.workbench .is-dragging,.workbench .document-dropzone.is-busy,.workbench .pdf-merge-processing,.workbench [aria-busy="true"]'
type Spark = { x: number; y: number; start: number; color: string }
const random = (x: number) => { const n = Math.sin(x * 12.9898) * 43758.5453; return n - Math.floor(n) }
function noise(x: number, time: number) {
  const i = Math.floor(x), f = x - i, smooth = f * f * (3 - 2 * f)
  return (random(i + Math.floor(time) * 57) * (1 - smooth) + random(i + 1 + Math.floor(time) * 57) * smooth - 0.5) * 3
}
export function installCanvasFeedback(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}
  let frame = 0, checkFrame = 0, last = 0
  let sparks: Spark[] = []
  let targets: Element[] = []
  let visibleTargets: Element[] = []
  const fit = () => {
    const dpr = Math.min(devicePixelRatio || 1, 1.5)
    canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  const start = () => { if (!frame && !document.hidden && (sparks.length || visibleTargets.length)) frame = requestAnimationFrame(draw) }
  const check = () => {
    checkFrame = 0
    targets = Array.from(document.querySelectorAll(active)).slice(0, 3)
    visibleTargets = targets.filter(el => { const r = el.getBoundingClientRect(); return r.width && r.height && r.bottom > 0 && r.top < innerHeight })
    start()
  }
  const scheduleCheck = () => { if (!document.hidden && !checkFrame) checkFrame = requestAnimationFrame(check) }
  const draw = (now: number) => {
    frame = 0
    if (document.hidden) return
    if (now - last < 1000 / 30) { start(); return }
    last = now
    ctx.clearRect(0, 0, innerWidth, innerHeight)
    sparks = sparks.filter(s => now - s.start < 480)
    ctx.lineCap = 'round'
    for (const spark of sparks) {
      const p = (now - spark.start) / 480, eased = 1 - (1 - p) ** 3
      ctx.strokeStyle = spark.color; ctx.globalAlpha = 1 - p; ctx.lineWidth = 2
      for (let n = 0; n < 8; n++) {
        const angle = n * Math.PI / 4
        const distance = 7 + eased * 26, length = (1 - eased) * 10
        ctx.beginPath(); ctx.moveTo(spark.x + Math.cos(angle) * distance, spark.y + Math.sin(angle) * distance)
        ctx.lineTo(spark.x + Math.cos(angle) * (distance + length), spark.y + Math.sin(angle) * (distance + length)); ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
    for (const target of visibleTargets) {
      const r = target.getBoundingClientRect()
      if (!target.isConnected || !r.width) continue
      ctx.strokeStyle = getComputedStyle(target).getPropertyValue('--studio-accent').trim() || '#7186a6'; ctx.lineWidth = 1.3; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 5
      // Rounded rectangle perimeter, displaced along its normal; no lines cross the contents.
      const radius = Math.min(16, r.width / 4, r.height / 4)
      ctx.beginPath()
      for (let n = 0; n <= 240; n++) {
        const angle = n / 240 * Math.PI * 2
        const c = Math.cos(angle), s = Math.sin(angle)
        const edge = Math.min((r.width / 2 - radius) / Math.max(Math.abs(c), 0.001), (r.height / 2 - radius) / Math.max(Math.abs(s), 0.001))
        const jitter = noise(n * 0.9, now / 100) + noise(n * 2, now / 80) * 0.4
        const x = r.left + r.width / 2 + c * (edge + radius + jitter)
        const y = r.top + r.height / 2 + s * (edge + radius + jitter)
        if (!n) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.closePath(); ctx.stroke(); ctx.shadowBlur = 0
    }
    start()
  }
  const click = (event: MouseEvent) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>(primary) : null
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true' || document.hidden) return
    const r = button.getBoundingClientRect()
    sparks = [...sparks.slice(-5), { x: event.detail ? event.clientX : r.left + r.width / 2, y: event.detail ? event.clientY : r.top + r.height / 2, start: performance.now(), color: getComputedStyle(button).getPropertyValue('--studio-accent').trim() || '#7186a6' }]
    start()
  }
  const visibility = () => {
    cancelAnimationFrame(frame); frame = 0; sparks = []
    cancelAnimationFrame(checkFrame); checkFrame = 0
    ctx.clearRect(0, 0, innerWidth, innerHeight)
    if (!document.hidden) check()
  }
  const mutations = new MutationObserver(scheduleCheck)
  mutations.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-busy'] })
  fit(); check()
  const resize = () => { fit(); check() }
  document.addEventListener('click', click, true)
  document.addEventListener('scroll', scheduleCheck, true)
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('resize', resize)
  return () => {
    cancelAnimationFrame(frame); cancelAnimationFrame(checkFrame); mutations.disconnect()
    document.removeEventListener('click', click, true); document.removeEventListener('scroll', scheduleCheck, true)
    document.removeEventListener('visibilitychange', visibility); window.removeEventListener('resize', resize)
    ctx.clearRect(0, 0, innerWidth, innerHeight)
  }
}
