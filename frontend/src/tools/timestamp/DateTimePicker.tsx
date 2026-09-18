import { memo, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { calendarDays, currentDateTime, dateKey, pad, pickerInitialValue, shiftDay, shiftMonth, type CalendarDate } from './calendarModel'
import { dateTimeToResult, parseWallDateTime, resolveTimeZone } from './timestampModel'
import NumberWheel from './NumberWheel'
import './dateTimePicker.css'

interface PickerProps {
  value: string
  timeZone: string
  onChange: (value: string) => void
  label?: string
  precision?: 'seconds' | 'milliseconds'
  readOnly?: boolean
  className?: string
}
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
const TIME_FIELDS = [
  { key: 'hour', label: '时', max: 23, digits: 2 },
  { key: 'minute', label: '分', max: 59, digits: 2 },
  { key: 'second', label: '秒', max: 59, digits: 2 },
] as const
type TimeFields = Record<typeof TIME_FIELDS[number]['key'], number>

function timeFields(value: ReturnType<typeof parseWallDateTime>): TimeFields {
  return { hour: value.hour, minute: value.minute, second: value.second }
}

function PickerIcon({ kind }: { kind: 'calendar' | 'left' | 'right' | 'close' | 'down' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'calendar' ? <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 10h18M8 14h2m4 0h2m-8 3h2" /></>
      : <path d={kind === 'left' ? 'm14 6-6 6 6 6' : kind === 'right' ? 'm10 6 6 6-6 6' : kind === 'down' ? 'm6 9 6 6 6-6' : 'm6 6 12 12M18 6 6 18'} />}
  </svg>
}

function DateTimePicker({ value, timeZone, onChange, label = '日期与时间', precision = 'milliseconds', readOnly = false, className = '' }: PickerProps) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  function close() { setOpen(false); trigger.current?.focus() }
  const displayPlaceholder = precision === 'milliseconds' ? 'YYYY-MM-DD HH:mm:ss.SSS' : 'YYYY-MM-DD HH:mm:ss'
  return <div className={`ts-date-input ${className}`.trim()}>
    <label htmlFor={`${id}-input`}>{label}</label>
    <div className={`dt-field ${open ? 'is-open' : ''}`}>
      <input id={`${id}-input`} aria-label={label} type="text" spellCheck={false} autoComplete="off" readOnly={readOnly}
        value={value.replace('T', ' ')} placeholder={displayPlaceholder}
        onChange={(event) => onChange(event.target.value.replace(' ', 'T'))}
        onClick={() => { if (readOnly) setOpen(true) }}
        onKeyDown={(event) => { if (event.altKey && event.key === 'ArrowDown') { event.preventDefault(); setOpen(true) } }} />
      <button ref={trigger} type="button" aria-label={`选择${label}`} title={`选择${label}（Alt + ↓）`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-dialog` : undefined} onClick={() => setOpen(true)}><PickerIcon kind="calendar" /></button>
    </div>
    {open && createPortal(<DateTimeDialog id={`${id}-dialog`} value={value} timeZone={timeZone} onChange={onChange} onClose={close} label={label} precision={precision} />, document.body)}
  </div>
}

export default memo(DateTimePicker)

function DateTimeDialog({ id, value, timeZone, onChange, onClose, label = '日期与时间', precision = 'milliseconds' }: PickerProps & { id: string; onClose: () => void }) {
  const [initial] = useState(() => pickerInitialValue(value, timeZone))
  const [selected, setSelected] = useState<CalendarDate>(initial)
  const [view, setView] = useState<CalendarDate>(initial)
  const [time, setTime] = useState(() => timeFields(initial))
  const [millisecond, setMillisecond] = useState(() => pad(initial.millisecond, 3))
  const [calendarMode, setCalendarMode] = useState<'days' | 'months' | 'years'>('days')
  const [yearPage, setYearPage] = useState(() => Math.floor((initial.year - 1) / 20) * 20 + 1)
  const [focusDay, setFocusDay] = useState(dateKey(initial))
  const moveFocus = useRef(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const calendar = useRef<HTMLDivElement>(null)
  const today = parseWallDateTime(currentDateTime(timeZone))
  const days = calendarDays(view.year, view.month)
  const usesMilliseconds = precision === 'milliseconds'
  const validMillisecond = !usesMilliseconds || /^\d{1,3}$/.test(millisecond)
  let error = validMillisecond ? '' : '请输入 0–999 的毫秒值'
  let ambiguous = false
  const normalized = `${dateKey(selected)}T${pad(time.hour)}:${pad(time.minute)}:${pad(time.second)}${usesMilliseconds ? `.${validMillisecond ? pad(millisecond, 3) : '___'}` : ''}`
  if (!error) {
    try { ambiguous = dateTimeToResult(normalized, timeZone).ambiguous }
    catch (reason) { error = reason instanceof Error ? reason.message : '日期时间无效' }
  }

  useEffect(() => {
    const element = dialog.current!
    const previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    element.showModal()
    element.querySelector<HTMLButtonElement>('[data-day][aria-pressed="true"]')?.focus()
    return () => {
      if (element.open) element.close()
      document.documentElement.style.overflow = previousOverflow
    }
  }, [])

  useLayoutEffect(() => {
    if (!moveFocus.current) return
    if (calendarMode === 'days') calendar.current?.querySelector<HTMLButtonElement>(`[data-day="${focusDay}"]`)?.focus()
    else dialog.current?.querySelector<HTMLButtonElement>(`${calendarMode === 'months' ? '.dt-month-picker' : '.dt-year-grid'} [aria-pressed="true"]`)?.focus()
    moveFocus.current = false
  }, [focusDay, view, calendarMode])

  function selectDay(date: CalendarDate) {
    setSelected(date); setView(date); setFocusDay(dateKey(date))
  }

  function navigateMonth(offset: number) {
    const next = shiftMonth(view, offset)
    if (next.year < 1 || next.year > 9999) return
    setView(next); setFocusDay(dateKey(next))
  }

  function calendarKey(event: KeyboardEvent<HTMLButtonElement>, date: CalendarDate, index: number) {
    let next: CalendarDate
    if (event.key === 'PageUp' || event.key === 'PageDown') next = shiftMonth(date, (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1))
    else {
      const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -(index % 7), End: 6 - index % 7 }
      const offset = offsets[event.key]
      if (offset === undefined) return
      next = shiftDay(date, offset)
    }
    event.preventDefault()
    if (next.year < 1 || next.year > 9999) return
    moveFocus.current = true; setFocusDay(dateKey(next)); setView(next)
  }

  function useNow() {
    const current = parseWallDateTime(currentDateTime(timeZone))
    selectDay(current); setTime(timeFields(current)); setMillisecond(pad(current.millisecond, 3)); setCalendarMode('days')
  }

  function navigateCalendar(offset: number) {
    if (calendarMode === 'days') navigateMonth(offset)
    else if (calendarMode === 'months') setView({ ...view, year: Math.max(1, Math.min(9999, view.year + offset)), day: 1 })
    else setYearPage(Math.max(1, Math.min(9981, yearPage + offset * 20)))
  }

  function changeCalendarMode() {
    moveFocus.current = true
    if (calendarMode === 'days') setCalendarMode('months')
    else if (calendarMode === 'months') {
      setYearPage(Math.floor((view.year - 1) / 20) * 20 + 1); setCalendarMode('years')
    } else setCalendarMode('months')
  }

  const previousDisabled = calendarMode === 'days' ? view.year === 1 && view.month === 1 : calendarMode === 'months' ? view.year === 1 : yearPage === 1
  const nextDisabled = calendarMode === 'days' ? view.year === 9999 && view.month === 12 : calendarMode === 'months' ? view.year === 9999 : yearPage === 9981
  const navigationUnit = calendarMode === 'days' ? '个月' : calendarMode === 'months' ? '一年' : '20年'

  function apply() {
    if (error) return
    onChange(normalized); closeDialog()
  }

  function closeDialog() {
    // Close the native modal first so its focus restoration cannot override the trigger focus.
    dialog.current?.close(); onClose()
  }

  return <dialog ref={dialog} id={id} className="dt-dialog" aria-labelledby={`${id}-title`} onCancel={(event) => { event.preventDefault(); closeDialog() }}
    onKeyDown={(event) => { if (event.key === 'Enter' && event.target instanceof HTMLElement && (event.target.getAttribute('role') === 'listbox' || event.target instanceof HTMLInputElement)) { event.preventDefault(); apply() } }}
    onClick={(event) => {
      if (event.target !== event.currentTarget) return
      const rect = event.currentTarget.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog()
    }}>
    <header className="dt-dialog-header"><span className="dt-heading-icon"><PickerIcon kind="calendar" /></span><div><h3 id={`${id}-title`}>选择{label}</h3><p>{resolveTimeZone(timeZone)}</p></div><button className="dt-icon-button" aria-label="关闭日期选择" onClick={closeDialog}><PickerIcon kind="close" /></button></header>
    <div className="dt-dialog-body">
      <section className="dt-calendar" aria-label="选择日期">
        <div className="dt-month-nav">
          <button className="dt-icon-button" aria-label={`上${navigationUnit}`} disabled={previousDisabled} onClick={() => navigateCalendar(-1)}><PickerIcon kind="left" /></button>
          <button className="dt-month-title" aria-label={calendarMode === 'days' ? '选择年月' : calendarMode === 'months' ? '选择年份' : '返回月份选择'} aria-expanded={calendarMode !== 'days'} onClick={changeCalendarMode}>
            <span>{calendarMode === 'days' ? `${view.year} 年 ${pad(view.month)} 月` : calendarMode === 'months' ? `${view.year} 年` : `${yearPage}–${Math.min(9999, yearPage + 19)}`}</span><PickerIcon kind="down" />
          </button>
          <button className="dt-icon-button" aria-label={`下${navigationUnit}`} disabled={nextDisabled} onClick={() => navigateCalendar(1)}><PickerIcon kind="right" /></button>
        </div>
        {calendarMode === 'years' ? <div className="dt-year-picker">
          <div className="dt-year-grid" role="group" aria-label="年份列表">{Array.from({ length: Math.min(20, 10000 - yearPage) }, (_, index) => yearPage + index).map((year) => <button key={year} aria-pressed={year === view.year} onClick={() => { setView({ ...view, year, day: 1 }); setCalendarMode('months'); moveFocus.current = true }}>{year} 年</button>)}</div>
          <div className="dt-year-jumps"><button disabled={yearPage === 1} onClick={() => setYearPage(Math.max(1, yearPage - 100))}>前 100 年</button><button disabled={yearPage === 9981} onClick={() => setYearPage(Math.min(9981, yearPage + 100))}>后 100 年</button></div>
        </div> : calendarMode === 'months' ? <div className="dt-month-picker">
          <p>点击上方年份切换年份</p>
          <div>{Array.from({ length: 12 }, (_, index) => <button key={index} aria-pressed={index + 1 === view.month} onClick={() => {
            const next = { year: view.year, month: index + 1, day: 1 }
            setView(next); setFocusDay(dateKey(next)); setCalendarMode('days'); moveFocus.current = true
          }}>{index + 1} 月</button>)}</div>
        </div> : <div key={`${view.year}-${view.month}`} className="dt-calendar-page" ref={calendar}>
          <div className="dt-weekdays" aria-hidden="true">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
          <div className="dt-days" role="group" aria-label={`${view.year}年${view.month}月日历`}>
            {days.map((date, index) => {
              const key = dateKey(date)
              const isToday = key === dateKey(today)
              return <button key={key} data-day={key} type="button" className={date.month === view.month ? '' : 'is-outside'}
                disabled={date.year < 1 || date.year > 9999} aria-label={`${date.year}年${date.month}月${date.day}日${isToday ? '，今天' : ''}`}
                aria-pressed={key === dateKey(selected)} aria-current={isToday ? 'date' : undefined} tabIndex={key === focusDay ? 0 : -1}
                onClick={() => { moveFocus.current = true; selectDay(date) }} onKeyDown={(event) => calendarKey(event, date, index)}>{date.day}{isToday && <i />}</button>
            })}
          </div>
        </div>}
        <div className="dt-calendar-footer"><span><i /> 今天</span><button onClick={() => { selectDay(today); setCalendarMode('days') }}>回到今天</button></div>
      </section>
      <section className="dt-time-panel" aria-label="编辑时间">
        <div className="dt-time-heading"><h4>时间</h4><span>24 小时制</span></div>
        <div className="dt-time-wheels">{TIME_FIELDS.map(({ key, label, max, digits }) => <NumberWheel key={key} label={label} value={time[key]} max={max} digits={digits} onChange={(next) => setTime((previous) => ({ ...previous, [key]: next }))} />)}</div>
        {usesMilliseconds && <div className="dt-millisecond-field"><label htmlFor={`${id}-ms`}>毫秒 <span>0–999</span></label><div>
          <input id={`${id}-ms`} aria-label="输入毫秒" type="text" inputMode="numeric" autoComplete="off" maxLength={3} value={millisecond} placeholder="000" aria-invalid={!validMillisecond} aria-describedby={!validMillisecond ? `${id}-error` : undefined}
            onChange={(event) => { if (/^\d{0,3}$/.test(event.target.value)) setMillisecond(event.target.value) }}
            onBlur={() => { if (validMillisecond) setMillisecond(pad(millisecond, 3)) }} /><span aria-hidden="true">ms</span>
        </div></div>}
        <div className="dt-time-shortcuts"><button onClick={useNow}>当前时间</button><button onClick={() => { setTime({ hour: 0, minute: 0, second: 0 }); setMillisecond('000') }}>零点</button></div>
        <p className="dt-time-hint">按住上下拖动，或用滚轮选择。</p>
      </section>
    </div>
    <footer className="dt-dialog-footer">
      <div className="dt-selection"><span>已选时间</span><output>{normalized.replace('T', ' ')}</output></div>
      {error && <p id={`${id}-error`} className="dt-picker-error" role="alert">{error}</p>}
      {ambiguous && <p className="dt-picker-warning">此时间在夏令时结束时出现两次，将采用较早的时刻。</p>}
      <div className="dt-footer-actions"><button onClick={closeDialog}>取消</button><button className="dt-apply" disabled={!!error} onClick={apply}>应用时间 <span aria-hidden="true">↗</span></button></div>
    </footer>
  </dialog>
}
