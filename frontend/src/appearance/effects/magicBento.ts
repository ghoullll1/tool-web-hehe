// React Bits MagicBento particle / tilt adaptation. Real catalog links remain the interactive elements.
import { gsap } from 'gsap'

export function installMagicBento() {
  const cleanups = new Map<HTMLElement, () => void>()
  const enter = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || document.hidden) return
    const card = event.target instanceof Element ? event.target.closest<HTMLElement>('.dashboard-quick-card') : null
    if (!card || cleanups.has(card)) return
    const particles = Array.from({ length: 7 }, (_, index) => {
      const particle = document.createElement('i')
      particle.className = 'nebula-bento-particle'
      particle.setAttribute('aria-hidden', 'true')
      particle.style.left = `${12 + index * 13}%`
      particle.style.top = `${20 + (index * 29) % 65}%`
      card.append(particle)
      gsap.fromTo(particle, { scale: 0, opacity: 0 }, {
        x: (index % 2 ? 1 : -1) * 18, y: -24, scale: 1, opacity: 0.75,
        duration: 0.7, delay: index * 0.045, yoyo: true, repeat: 1,
        onComplete: () => particle.remove(),
      })
      return particle
    })
    const move = (e: PointerEvent) => {
      const r = card.getBoundingClientRect()
      gsap.to(card, { rotateX: -(e.clientY - r.top - r.height / 2) / r.height * 5,
        rotateY: (e.clientX - r.left - r.width / 2) / r.width * 5,
        transformPerspective: 900, duration: 0.3, overwrite: 'auto' })
    }
    const clear = () => {
      card.removeEventListener('pointermove', move); card.removeEventListener('pointerleave', clear)
      gsap.killTweensOf(card); gsap.set(card, { clearProps: 'transform' })
      particles.forEach(p => { gsap.killTweensOf(p); p.remove() })
      cleanups.delete(card)
    }
    card.addEventListener('pointermove', move); card.addEventListener('pointerleave', clear)
    cleanups.set(card, clear)
  }
  const clearAll = () => { for (const clear of cleanups.values()) clear() }
  const visibility = () => { if (document.hidden) clearAll() }
  document.addEventListener('pointerover', enter)
  document.addEventListener('visibilitychange', visibility)
  // Scrolling away must not leave particles/tweens active on a now off-screen card.
  document.addEventListener('scroll', clearAll, true)
  return () => {
    clearAll(); document.removeEventListener('pointerover', enter)
    document.removeEventListener('visibilitychange', visibility); document.removeEventListener('scroll', clearAll, true)
  }
}
