import { useEffect, useState, type RefObject } from 'react'
import { useLocation } from 'react-router-dom'
import { useAppearance } from './AppearanceContext'

export function useNavigationDrawer(sidebar: RefObject<HTMLElement | null>, trigger: RefObject<HTMLButtonElement | null>) {
  const { edition } = useAppearance()
  const { pathname } = useLocation()
  const [openAt, setOpenAt] = useState<string | null>(null)
  const [narrow, setNarrow] = useState(() => window.matchMedia?.('(max-width: 850px)').matches ?? false)
  const open = edition === 'modern' && narrow && openAt === pathname
  const close = () => setOpenAt(null)
  useEffect(() => {
    const media = window.matchMedia?.('(max-width: 850px)')
    if (!media) return
    const update = () => { setNarrow(media.matches); if (!media.matches) setOpenAt(null) }
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!open || !sidebar.current) return
    const panel = sidebar.current
    const main = document.querySelector<HTMLElement>('.main-content')
    const previousInert = main?.inert ?? false
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (main) main.inert = true
    const buttons = () => Array.from(panel.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled)')).filter(el => el.getClientRects().length)
    panel.querySelector<HTMLButtonElement>('.nebula-drawer-close')?.focus()
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpenAt(null) }
      if (event.key !== 'Tab') return
      const list = buttons(), first = list[0], last = list[list.length - 1]
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keyboard)
    const triggerNode = trigger.current
    return () => {
      document.removeEventListener('keydown', keyboard)
      document.body.style.overflow = overflow
      if (main) main.inert = previousInert
      triggerNode?.focus()
    }
  }, [open, sidebar, trigger])
  return { open, close, toggle: () => setOpenAt(open ? null : pathname) }
}
