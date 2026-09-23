import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { installSelectionEffects } from './selectionEffects'
import { installCanvasFeedback } from './canvasFeedback'

export default function InteractionEffects({ full }: { full: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const { pathname } = useLocation()
  useEffect(() => {
    if (!full || pathname !== '/') return
    let disposed = false
    let cleanup: (() => void) | undefined
    void import('./magicBento').then(({ installMagicBento }) => {
      if (!disposed) cleanup = installMagicBento()
    }).catch(() => { /* Static links remain fully usable if the decorative chunk cannot load. */ })
    return () => { disposed = true; cleanup?.() }
  }, [full, pathname])
  useEffect(() => installSelectionEffects(), [])
  useEffect(() => {
    if (!full || !canvas.current) return
    return installCanvasFeedback(canvas.current)
  }, [full])
  useEffect(() => {
    const update = () => { document.documentElement.dataset.pageVisible = document.hidden ? 'no' : 'yes' }
    update(); document.addEventListener('visibilitychange', update)
    return () => { document.removeEventListener('visibilitychange', update); delete document.documentElement.dataset.pageVisible }
  }, [])
  return full ? createPortal(<canvas ref={canvas} className="nebula-feedback" aria-hidden="true" />, document.body) : null
}
