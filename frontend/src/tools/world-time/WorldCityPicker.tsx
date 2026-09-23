import { Icon } from '../../components/Icon'
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { formatUtcOffset, getTimeZoneOffsetMinutes, type WorldCity } from './worldTimeModel'

interface WorldCityPickerProps {
  cities: readonly WorldCity[]
  value: string
  referenceDate: Date
  onChange: (value: string) => void
}

function ChevronIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
}

interface PopoverPosition {
  left: number
  top: number
  width: number
  maxHeight: number
  placement: 'top' | 'bottom'
}

type PopoverStyle = CSSProperties & {
  '--world-city-left': string
  '--world-city-top': string
  '--world-city-width': string
  '--world-city-max-height': string
}

export default function WorldCityPicker({ cities, value, referenceDate, onChange }: WorldCityPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState<PopoverPosition | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const listId = useId()
  const dialogId = useId()
  const titleId = useId()
  const selected = cities.find((city) => city.id === value) ?? cities[0]
  const results = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase()
    return cities.filter((city) => !keyword || [city.name, city.country, city.region, city.timeZone].some((item) => item.toLocaleLowerCase().includes(keyword)))
  }, [cities, query])

  const updatePosition = useCallback(() => {
    const anchor = trigger.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth
    const viewportHeight = window.innerHeight
    const width = Math.min(Math.max(rect.width, 360), Math.max(280, viewportWidth - 24))
    const left = Math.min(Math.max(12, rect.right - width), Math.max(12, viewportWidth - width - 12))
    const bottomSpace = viewportHeight - rect.bottom - 12
    const topSpace = rect.top - 12
    const placement = bottomSpace >= 300 || bottomSpace >= topSpace ? 'bottom' : 'top'
    const availableHeight = placement === 'bottom' ? bottomSpace : topSpace
    const maxHeight = Math.min(410, Math.max(220, availableHeight))
    const top = placement === 'bottom' ? rect.bottom + 8 : Math.max(12, rect.top - maxHeight - 8)
    setPosition({ left, top, width, maxHeight, placement })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
    let frame = 0
    const schedulePositionUpdate = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(updatePosition)
    }
    window.addEventListener('resize', schedulePositionUpdate)
    window.addEventListener('scroll', schedulePositionUpdate, true)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedulePositionUpdate)
      window.removeEventListener('scroll', schedulePositionUpdate, true)
    }
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return
    const closeOnFocusOut = (event: FocusEvent) => {
      const target = event.target as Node
      if (!root.current?.contains(target) && !layer.current?.contains(target)) close()
    }
    document.addEventListener('focusin', closeOnFocusOut)
    const frame = window.requestAnimationFrame(() => search.current?.focus())
    return () => {
      document.removeEventListener('focusin', closeOnFocusOut)
      window.cancelAnimationFrame(frame)
    }
  }, [open])

  function close(restoreFocus = false) {
    setOpen(false)
    setQuery('')
    if (restoreFocus) window.requestAnimationFrame(() => trigger.current?.focus())
  }

  function openPicker() {
    updatePosition()
    setOpen(true)
  }

  function moveOption(event: KeyboardEvent<HTMLElement>, direction: 1 | -1) {
    event.preventDefault()
    const options = [...(layer.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])]
    if (!options.length) return
    const current = options.indexOf(document.activeElement as HTMLButtonElement)
    options[(current + direction + options.length) % options.length]?.focus()
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); close(true); return }
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault(); openPicker()
    }
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); close(true); return }
    if (event.key === 'Tab') {
      const focusable = [...(layer.current?.querySelectorAll<HTMLElement>('button:not([tabindex="-1"]), input') ?? [])]
      if (!focusable.length) return
      const current = focusable.indexOf(document.activeElement as HTMLElement)
      if (event.shiftKey && current <= 0) { event.preventDefault(); focusable.at(-1)?.focus() }
      if (!event.shiftKey && current === focusable.length - 1) { event.preventDefault(); focusable[0]?.focus() }
      return
    }
    if (event.key === 'ArrowDown') moveOption(event, 1)
    if (event.key === 'ArrowUp') moveOption(event, -1)
  }

  const overlayStyle = position ? {
    position: 'fixed',
    '--world-city-left': `${position.left}px`,
    '--world-city-top': `${position.top}px`,
    '--world-city-width': `${position.width}px`,
    '--world-city-max-height': `${position.maxHeight}px`,
  } satisfies PopoverStyle : undefined

  const menu = open && position ? createPortal(<div className="world-city-layer" ref={layer} style={overlayStyle} onKeyDown={handleMenuKeyDown}>
    <button type="button" className="world-city-scrim" tabIndex={-1} aria-label="关闭时间所属城市选择遮罩" onClick={() => close(true)} />
    <div id={dialogId} className={`world-city-menu is-${position.placement}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="world-city-menu-header">
        <span><small>REFERENCE CITY</small><strong id={titleId}>选择时间所属城市</strong></span>
        <button type="button" aria-label="关闭时间所属城市选择" onClick={() => close(true)}><Icon name="close" /></button>
      </header>
      <label className="world-city-menu-search"><span aria-hidden="true"><Icon name="search" /></span><input ref={search} type="search" aria-label="筛选时间所属城市" placeholder="搜索城市、国家或时区" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div id={listId} role="listbox" aria-label="时间所属城市选项">
        {results.map((city) => <button type="button" role="option" aria-selected={city.id === value} key={city.id} onClick={() => { onChange(city.id); close(true) }}>
          <span><strong>{city.name}</strong><small>{city.country} · {city.timeZone}</small></span>
          <b>{formatUtcOffset(getTimeZoneOffsetMinutes(referenceDate, city.timeZone))}</b>
          <i aria-hidden="true"><Icon name="check" /></i>
        </button>)}
        {!results.length && <p>没有匹配的已添加城市</p>}
      </div>
      <footer><i aria-hidden="true" />仅显示当前时间面板中的城市</footer>
    </div>
  </div>, document.body) : null

  return <>
    <div className={`world-city-picker${open ? ' is-open' : ''}`} ref={root} onKeyDown={handleTriggerKeyDown}>
      <span className="world-planner-label">时间属于</span>
      <button ref={trigger} type="button" className="world-city-trigger" aria-label="选择时间所属城市" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? dialogId : undefined} onClick={() => open ? close() : openPicker()}>
        <span><strong>{selected?.name ?? '选择城市'}</strong><small>{selected?.country ?? ''}</small></span>
        <b>{selected ? formatUtcOffset(getTimeZoneOffsetMinutes(referenceDate, selected.timeZone)) : ''}</b>
        <ChevronIcon />
      </button>
    </div>
    {menu}
  </>
}
