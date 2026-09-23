import { lazy, Suspense, useEffect, useRef } from 'react'
import { useAppearance } from './AppearanceContext'
import { EffectBoundary } from './effects/EffectBoundary'
import { observeVisibility } from './effects/visibility'

const DarkVeil = lazy(() => import('./effects/DarkVeil'))
export function NebulaBackdrop() {
  const { edition, effectiveMotion } = useAppearance()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    return observeVisibility(node, visible => { node.dataset.visible = visible ? 'yes' : 'no' })
  }, [edition])
  if (edition !== 'modern') return null
  return <div ref={ref} className="nebula-backdrop" aria-hidden="true">
    {effectiveMotion === 'full' && <EffectBoundary><Suspense fallback={null}><DarkVeil /></Suspense></EffectBoundary>}
    <div className="nebula-stars" />
  </div>
}
