import { useId, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { pad } from './calendarModel'

const ROW_HEIGHT = 36
const EDGE_SPACE = ROW_HEIGHT * 2

interface NumberWheelProps {
  label: string
  value: number
  max: number
  digits: number
  onChange: (value: number) => void
}

interface WheelDrag { pointerId: number; startY: number; startTop: number; moved: boolean; option: number | null }

/** A fixed-range listbox with bounded rendering, native scrolling, and mouse dragging. */
export default function NumberWheel({ label, value, max, digits, onChange }: NumberWheelProps) {
  const id = useId()
  const viewport = useRef<HTMLDivElement>(null)
  const selected = useRef(value)
  const lastScrolled = useRef<number | null>(null)
  const drag = useRef<WheelDrag | null>(null)
  const suppressClick = useRef(false)
  const aligned = useRef(false)
  const [center, setCenter] = useState(value)

  useLayoutEffect(() => {
    selected.current = value
    // Do not pull the wheel back while a user's scroll is still in motion.
    const fromScroll = lastScrolled.current === value
    lastScrolled.current = null
    if (viewport.current && !fromScroll) viewport.current.scrollTop = value * ROW_HEIGHT
  }, [value])

  useLayoutEffect(() => {
    const element = viewport.current!
    // A dialog starts hidden; align after it enters the top layer or is resized.
    const align = () => {
      if (!element.clientHeight) return
      element.scrollTop = selected.current * ROW_HEIGHT
      aligned.current = true
    }
    if (typeof ResizeObserver === 'undefined') { aligned.current = true; return }
    const observer = new ResizeObserver(align)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  function select(next: number) {
    const bounded = Math.max(0, Math.min(max, next))
    lastScrolled.current = null
    if (viewport.current) viewport.current.scrollTop = bounded * ROW_HEIGHT
    onChange(bounded)
    viewport.current?.focus({ preventScroll: true })
  }

  function updateFromScroll(top: number) {
    const next = Math.max(0, Math.min(max, Math.round(top / ROW_HEIGHT)))
    setCenter(next)
    if (selected.current !== next) {
      lastScrolled.current = next
      onChange(next)
    }
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    // Touch keeps native pan/inertia; only the primary mouse button starts custom dragging.
    if (event.pointerType !== 'mouse' || event.button !== 0 || drag.current) return
    const element = event.currentTarget
    const option = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-wheel-value]') : null
    drag.current = { pointerId: event.pointerId, startY: event.clientY, startTop: element.scrollTop, moved: false, option: option ? Number(option.dataset.wheelValue) : null }
    suppressClick.current = false
    event.preventDefault()
    element.focus({ preventScroll: true })
    element.dataset.dragging = 'true'
    element.setPointerCapture(event.pointerId)
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current
    if (!active || event.pointerId !== active.pointerId) return
    const distance = active.startY - event.clientY
    if (!active.moved && Math.abs(distance) < 4) return
    active.moved = true
    event.preventDefault()
    const top = Math.max(0, Math.min(max * ROW_HEIGHT, active.startTop + distance))
    event.currentTarget.scrollTop = top
    // Publish synchronously, so releasing then immediately applying cannot commit an old value.
    updateFromScroll(top)
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const active = drag.current
    if (!active || event.pointerId !== active.pointerId) return
    drag.current = null
    const element = event.currentTarget
    delete element.dataset.dragging
    suppressClick.current = true
    if (active.moved) select(Math.round(element.scrollTop / ROW_HEIGHT))
    else if (!cancelled && active.option !== null) select(active.option)
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
  }

  const start = Math.max(0, center - 6)
  const end = Math.min(max, center + 6)
  const visible = Array.from({ length: end - start + 1 }, (_, index) => start + index)
  // Keep aria-activedescendant mounted during a programmatic jump.
  const options = [...new Set([...visible, value])].sort((left, right) => left - right)

  return <div className="dt-wheel">
    <span>{label}</span>
    <div className="dt-wheel-shell">
      <div ref={viewport} className="dt-wheel-scroll" role="listbox" tabIndex={0} aria-label={`选择${label}`} aria-activedescendant={`${id}-${value}`}
        onScroll={(event) => { if (aligned.current) updateFromScroll(event.currentTarget.scrollTop) }}
        onPointerDown={startDrag} onPointerMove={moveDrag}
        onPointerUp={(event) => finishDrag(event)} onPointerCancel={(event) => finishDrag(event, true)} onLostPointerCapture={(event) => finishDrag(event, true)}
        onDragStart={(event) => event.preventDefault()}
        onClickCapture={(event) => { if (suppressClick.current && event.detail > 0) { suppressClick.current = false; event.preventDefault(); event.stopPropagation() } }}
        onKeyDown={(event) => {
          const offsets: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 }
          let next: number
          if (event.key === 'Home') next = 0
          else if (event.key === 'End') next = max
          else if (offsets[event.key] !== undefined) next = value + offsets[event.key]!
          else return
          event.preventDefault(); select(next)
        }}>
        <div className="dt-wheel-track" style={{ height: (max + 1) * ROW_HEIGHT + EDGE_SPACE * 2 }}>
          {options.map((option) => <button key={option} id={`${id}-${option}`} role="option" data-wheel-value={option} aria-selected={option === value} tabIndex={-1}
            style={{ top: EDGE_SPACE + option * ROW_HEIGHT }} onClick={() => select(option)}>{pad(option, digits)}</button>)}
        </div>
      </div>
      <div className="dt-wheel-selection" aria-hidden="true" />
    </div>
  </div>
}
