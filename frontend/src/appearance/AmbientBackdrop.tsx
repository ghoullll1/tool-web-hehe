import { lazy, Suspense } from 'react'
import { useAppearance } from './AppearanceContext'
import { EffectBoundary } from './effects/EffectBoundary'
import { ambientMotif } from './ambientMotifs'

const AmbientField = lazy(() => import('./effects/AmbientField'))

/** Outside the opaque editing surfaces; edition changes never replace tool children. */
export function AmbientBackdrop({ tone, slug = '' }: { tone: string; slug?: string }) {
  const { edition, effectiveMotion } = useAppearance()
  if (edition !== 'modern') return null
  const motif = ambientMotif(slug)
  return <div className="studio-ambient" data-effect={motif.effect} aria-hidden="true"
    style={{ background: `linear-gradient(135deg, ${motif.colors[0]}30, #f6f7fa 50%, ${motif.colors[1]}35)` }}>
    {effectiveMotion === 'full' && <EffectBoundary><Suspense fallback={null}><AmbientField tone={tone} motif={motif} /></Suspense></EffectBoundary>}
  </div>
}
