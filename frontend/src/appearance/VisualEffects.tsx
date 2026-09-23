import { lazy, Suspense } from 'react'
import { useAppearance } from './AppearanceContext'
import { EffectBoundary } from './effects/EffectBoundary'

const InteractionEffects = lazy(() => import('./effects/InteractionEffects'))
export function VisualEffects() {
  const { edition, effectiveMotion } = useAppearance()
  if (edition !== 'modern' || effectiveMotion === 'off') return null
  return <EffectBoundary><Suspense fallback={null}><InteractionEffects full={effectiveMotion === 'full'} /></Suspense></EffectBoundary>
}
