import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { APPEARANCE_KEY, LEGACY_APPEARANCE_KEY, AppearanceContext, type Edition, type MotionLevel } from './AppearanceContext'

function readPreference(): { edition: Edition; motion: MotionLevel } {
  try {
    const saved = JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? 'null')
    if (saved?.edition === 'classic' || saved?.edition === 'modern') {
      return { edition: saved.edition, motion: ['full', 'lite', 'off'].includes(saved.motion) ? saved.motion : 'full' }
    }
    const legacy = JSON.parse(localStorage.getItem(LEGACY_APPEARANCE_KEY) ?? 'null')
    return { edition: 'modern', motion: legacy?.motion === false ? 'off' : 'full' }
  } catch { return { edition: 'modern', motion: 'full' } }
}

function useMedia(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? false)
  useEffect(() => {
    const media = window.matchMedia?.(query)
    if (!media) return
    const update = () => setMatches(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])
  return matches
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState(readPreference)
  const systemReduced = useMedia('(prefers-reduced-motion: reduce)')
  const lightweightDevice = useMedia('(max-width: 760px), (pointer: coarse)')
  const effectiveMotion: MotionLevel = systemReduced || preference.motion === 'off' ? 'off'
    : lightweightDevice || preference.motion === 'lite' ? 'lite' : 'full'
  const reducedMotion = effectiveMotion === 'off'

  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.ui = preference.edition
    root.dataset.motion = effectiveMotion === 'off' ? 'reduced' : effectiveMotion
    return () => { delete root.dataset.ui; delete root.dataset.motion }
  }, [preference.edition, effectiveMotion])

  useEffect(() => {
    try { localStorage.setItem(APPEARANCE_KEY, JSON.stringify(preference)) } catch { /* Appearance also works with storage disabled. */ }
  }, [preference])

  return <AppearanceContext.Provider value={{
    ...preference, reducedMotion, effectiveMotion, systemReduced,
    setEdition: edition => setPreference(current => ({ ...current, edition })),
    setMotion: motion => setPreference(current => ({ ...current, motion })),
  }}>{children}</AppearanceContext.Provider>
}
