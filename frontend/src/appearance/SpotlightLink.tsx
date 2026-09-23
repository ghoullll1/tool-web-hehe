// Adapted from React Bits SpotlightCard (David Haz). See public/licenses/react-bits.txt.
import { Link, type LinkProps } from 'react-router-dom'
import type { PointerEvent } from 'react'
import { useAppearance } from './AppearanceContext'

export function SpotlightLink({ className = '', children, ...props }: LinkProps) {
  const { edition, reducedMotion } = useAppearance()
  const enabled = edition === 'modern' && !reducedMotion
  function handlePointerMove(event: PointerEvent<HTMLAnchorElement>) {
    if (event.pointerType !== 'mouse') return
    const bounds = event.currentTarget.getBoundingClientRect()
    event.currentTarget.style.setProperty('--spot-x', `${event.clientX - bounds.left}px`)
    event.currentTarget.style.setProperty('--spot-y', `${event.clientY - bounds.top}px`)
  }
  return <Link {...props} className={`${className} ${enabled ? 'bits-spotlight' : ''}`} onPointerMove={enabled ? handlePointerMove : undefined}>
    {children}
  </Link>
}
