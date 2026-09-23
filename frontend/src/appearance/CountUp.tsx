// React Bits CountUp adaptation: final value is always accessible; animation never owns business data.
import { useEffect, useRef } from 'react'
import { useAppearance } from './AppearanceContext'
import { observeVisibility } from './effects/visibility'

export function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const { edition, reducedMotion } = useAppearance()
  const text = value.toString().padStart(2, '0')
  useEffect(() => {
    const node = ref.current!
    if (edition !== 'modern' || reducedMotion || !value) return
    let disposed = false, started = false, onScreen = false
    let animation: { stop: () => void } | undefined
    const unobserve = observeVisibility(node, visible => {
      onScreen = visible
      if (!visible) { animation?.stop(); node.textContent = text; return }
      if (started) return
      started = true
      void import('motion').then(({ animate }) => {
        if (disposed || document.hidden || !onScreen) return
        animation = animate(0, value, { duration: 0.85, ease: 'easeOut', onUpdate: number => { node.textContent = Math.round(number).toString().padStart(2, '0') } })
      }).catch(() => { node.textContent = text })
    })
    return () => { disposed = true; animation?.stop(); unobserve(); node.textContent = text }
  }, [edition, reducedMotion, text, value])
  return <strong aria-label={text}><span ref={ref} aria-hidden="true">{text}</span></strong>
}
