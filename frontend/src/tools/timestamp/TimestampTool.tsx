import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { ToolViewProps } from '../registry'
import DateTimePicker from './DateTimePicker'
import { formatTimestampFormats } from './timestampFormats'
import {
  MAX_BATCH_LINES,
  TIME_ZONES,
  convertBatch,
  convertBatchUnit,
  convertTimestampUnit,
  dateTimeToResult,
  formatDateTimeInput,
  formatTimestamp,
  timestampToResult,
  type DateTimeResult,
  type TimestampResult,
  type TimestampUnit,
} from './timestampModel'
import './timestamp.css'

type Notice = { tone: 'neutral' | 'success' | 'error'; message: string }

const UNITS: readonly { id: TimestampUnit; label: string }[] = [
  { id: 'auto', label: '自动识别' }, { id: 'seconds', label: '秒' }, { id: 'milliseconds', label: '毫秒' },
]

export default function TimestampTool({ tool }: ToolViewProps) {
  const [now, setNow] = useState(() => new Date())
  const [live, setLive] = useState(true)
  const [timeZone, setTimeZone] = useState('local')
  const [tab, setTab] = useState<'single' | 'batch'>('single')
  const [timestampInput, setTimestampInput] = useState('')
  const [timestampTouched, setTimestampTouched] = useState(false)
  const [unit, setUnit] = useState<TimestampUnit>('auto')
  const [dateTimeInput, setDateTimeInput] = useState(() => formatDateTimeInput(new Date(), 'local'))
  const [batchInput, setBatchInput] = useState('')
  const [batchUnit, setBatchUnit] = useState<TimestampUnit>('auto')
  const [batchOutput, setBatchOutput] = useState<ReturnType<typeof convertBatch>>([])
  const [notice, setNotice] = useState<Notice>({ tone: 'neutral', message: '转换仅在浏览器本地完成，输入内容不会上传' })

  useEffect(() => {
    if (!live) return
    const timer = window.setInterval(() => setNow(new Date()), 250)
    return () => window.clearInterval(timer)
  }, [live])

  const current = useMemo(() => formatTimestamp(now, timeZone, now), [now, timeZone])
  const timestampState = useMemo(() => {
    if (!timestampInput.trim()) return { result: null, error: null }
    try { return { result: timestampToResult(timestampInput, unit, timeZone, now), error: null } }
    catch (error) { return { result: null, error: error instanceof Error ? error.message : '转换失败' } }
  }, [now, timeZone, timestampInput, unit])
  const dateTimeState = useMemo(() => {
    try { return { result: dateTimeToResult(dateTimeInput, timeZone, now), error: null } }
    catch (error) { return { result: null, error: error instanceof Error ? error.message : '转换失败' } }
  }, [dateTimeInput, now, timeZone])

  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setNotice({ tone: 'success', message: `${label}已复制` }) }
    catch { setNotice({ tone: 'error', message: '复制失败，请检查浏览器剪贴板权限' }) }
  }

  function useCurrentTimestamp() {
    setTimestampInput(Date.now().toString()); setTimestampTouched(true); setUnit('milliseconds')
    setNotice({ tone: 'neutral', message: '已填入当前毫秒时间戳' })
  }

  function runBatch() {
    try {
      const results = convertBatch(batchInput, batchUnit, timeZone)
      setBatchOutput(results)
      const failures = results.filter((item) => !item.ok).length
      setNotice({ tone: failures ? 'error' : 'success', message: failures ? `转换完成，其中 ${failures} 行无法识别` : `已转换 ${results.length} 行时间戳` })
    } catch (error) {
      setBatchOutput([]); setNotice({ tone: 'error', message: error instanceof Error ? error.message : '批量转换失败' })
    }
  }

  function changeUnit(nextUnit: TimestampUnit) {
    if (nextUnit === unit) return
    if (timestampState.result) setTimestampInput(convertTimestampUnit(timestampInput, unit, nextUnit))
    setUnit(nextUnit)
    const message = nextUnit === 'auto' ? '已启用自动识别，输入保持不变'
      : timestampState.result ? '已换算输入单位，日期时间保持不变' : '输入时间戳后自动转换'
    setNotice({ tone: 'neutral', message })
  }

  function changeBatchUnit(nextUnit: TimestampUnit) {
    if (nextUnit === batchUnit) return
    try {
      setBatchInput(convertBatchUnit(batchInput, batchUnit, nextUnit))
      setBatchUnit(nextUnit)
      setBatchOutput([])
      setNotice({ tone: 'neutral', message: nextUnit === 'auto'
        ? '已启用自动识别，输入保持不变，点击开始转换查看结果'
        : '已换算有效行的输入单位，点击开始转换查看结果' })
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : '单位换算失败' })
    }
  }

  return <div className="ts-tool" data-tool={tool.slug}>
    <section className="ts-now">
      <div className="ts-now-copy">
        <div className="ts-now-heading"><span>当前时间</span>
          <button type="button" className={`ts-live ${live ? 'is-live' : ''}`} aria-label="实时刷新" aria-pressed={live} title={live ? '点击暂停刷新' : '点击恢复刷新'} onClick={() => setLive((value) => !value)}>
            {live ? <i aria-hidden="true" /> : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3v10M11 3v10" /></svg>}
            <span>{live ? '实时刷新' : '已暂停'}</span>
          </button>
        </div>
        <h2>{current.zonedTime.slice(0, 8)}<small>{current.zonedTime.slice(8)}</small></h2><p>{current.zonedDate} · {current.weekday}</p><b>{current.timeZoneName} · {current.offset}</b>
      </div>
      <div className="ts-now-stamps">
        <button onClick={() => void copy(current.timestampSeconds, '秒级时间戳')}><span>UNIX · 秒</span><strong>{current.timestampSeconds}</strong><i>复制</i></button>
        <button onClick={() => void copy(current.timestampMilliseconds, '毫秒时间戳')}><span>UNIX · 毫秒</span><strong>{current.timestampMilliseconds}</strong><i>复制</i></button>
      </div>
    </section>

    <section className="ts-toolbar">
      <div className="ts-tabs" role="group" aria-label="转换模式"><button aria-pressed={tab === 'single'} onClick={() => setTab('single')}>单次转换</button><button aria-pressed={tab === 'batch'} onClick={() => setTab('batch')}>批量转换</button></div>
      <TimeZonePicker value={timeZone} onChange={(value) => { setTimeZone(value); setBatchOutput([]) }} />
    </section>

    {tab === 'single' ? <div className="ts-single-workspace"><div className="ts-single">
      <section className="ts-converter ts-to-date" aria-label="时间戳转日期时间"><ConverterHeading index="01" icon="digits" title="时间戳 → 日期时间" detail="切换秒 / 毫秒时同步换算输入，保持同一时刻" />
        <div className="ts-input-row"><input aria-label="输入时间戳" inputMode="decimal" spellCheck={false} value={timestampInput} placeholder="例如：1735689600 或 1735689600000" onBlur={() => setTimestampTouched(true)} onChange={(event) => { setTimestampInput(event.target.value); setTimestampTouched(true) }} /><button onClick={useCurrentTimestamp}>使用当前</button></div>
        <OptionGroup label="输入单位" options={UNITS} value={unit} onChange={changeUnit} />
        {timestampTouched && timestampState.error && <p className="ts-error" role="alert">{timestampState.error}</p>}
        {timestampState.result ? <DatePreview result={timestampState.result} /> : <EmptyResult icon="date" text="输入时间戳后，这里会立即显示日期与时区信息" />}
      </section>

      <section className="ts-converter ts-to-stamp" aria-label="日期时间转时间戳"><ConverterHeading index="02" icon="calendar" title="日期时间 → 时间戳" detail="按选中的时区解释输入时间" />
        <DateTimePicker value={dateTimeInput} timeZone={timeZone} onChange={setDateTimeInput} />
        {dateTimeState.error && <p className="ts-error" role="alert">{dateTimeState.error}</p>}
        {dateTimeState.result ? <TimestampResultView result={dateTimeState.result} onCopy={copy} /> : <EmptyResult icon="stamp" text="选择完整的日期与时间后生成时间戳" />}
      </section>
    </div>
      {timestampState.result && <DateFormats result={timestampState.result} timeZone={timeZone} onCopy={copy} />}
    </div> : <section className="ts-batch">
      <header><ConverterHeading index="BATCH" icon="digits" title="批量时间戳转换" detail={`每行一个，最多 ${MAX_BATCH_LINES} 行`} /><button onClick={() => { setBatchInput(''); setBatchOutput([]) }}>清空</button></header>
      <div className="ts-batch-grid"><div><textarea aria-label="批量时间戳" value={batchInput} placeholder={'1704067200\n1719792000000\n1722470400123'} onChange={(event) => { setBatchInput(event.target.value); setBatchOutput([]) }} /><div className="ts-batch-actions"><OptionGroup label="输入单位" options={UNITS} value={batchUnit} onChange={changeBatchUnit} /><button className="ts-primary" onClick={runBatch}>开始转换 →</button></div></div><BatchResults rows={batchOutput} onCopy={copy} /></div>
    </section>}

    <div className={`ts-notice is-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}><span>{notice.tone === 'success' ? '✓' : notice.tone === 'error' ? '!' : 'i'}</span>{notice.message}<b>浏览器本地处理</b></div>
  </div>
}

function ConverterHeading({ index, icon, title, detail }: { index: string; icon: 'digits' | 'calendar'; title: string; detail: string }) {
  return <header className="ts-heading"><span>{index}</span><TimeIcon type={icon} /><div><h3>{title}</h3><p>{detail}</p></div></header>
}

function TimeIcon({ type }: { type: 'digits' | 'calendar' | 'date' | 'stamp' }) {
  if (type === 'calendar' || type === 'date') return <svg className="ts-icon" viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="6.5" width="24" height="21" rx="3" /><path d="M9 3.5v6M23 3.5v6M4 12h24M9 17h4M17 17h5M9 22h4M17 22h5" /></svg>
  return <svg className="ts-icon" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12" /><path d="M16 9v8l5 3M12 3h8" /></svg>
}

function OptionGroup({ label, options, value, onChange }: { label: string; options: readonly { id: TimestampUnit; label: string }[]; value: TimestampUnit; onChange: (value: TimestampUnit) => void }) {
  return <div className="ts-option-block"><span>{label}</span><div className="ts-options" role="group" aria-label={label}>{options.map((option) => <button type="button" key={option.id} aria-pressed={value === option.id} onClick={() => onChange(option.id)}>{option.label}</button>)}</div></div>
}

function DatePreview({ result }: { result: TimestampResult }) {
  return <div className="ts-date-preview"><div className="ts-big-date"><span>{result.zonedDate}</span><strong>{result.zonedTime}</strong><p>{result.weekday} · {result.offset} · {result.relative}</p></div><p className="ts-precision">识别为{unitLabel(result.detectedUnit)}</p></div>
}

function DateFormats({ result, timeZone, onCopy }: { result: TimestampResult; timeZone: string; onCopy: (value: string, label: string) => Promise<void> }) {
  const milliseconds = result.date.getTime()
  const formats = useMemo(() => formatTimestampFormats(milliseconds, timeZone), [milliseconds, timeZone])
  return <section className="ts-date-result" aria-label="时间戳多格式结果">
    <header className="ts-format-heading"><div><h3>多格式结果</h3><p>ISO 8601 使用 UTC，其余默认跟随显示时区。</p></div><span className="ts-format-source">来自时间戳输入</span></header>
    <dl className="ts-format-grid">{formats.map((format) => <ResultRow key={format.label} {...format} onCopy={onCopy} />)}</dl>
    <p className="ts-format-note">ISO 8601 与 RFC 3339 保留毫秒，其余以上格式精确到秒。</p>
    <details className="ts-more-formats"><summary>更多格式 · UTC / GMT、完整时间</summary><dl><ResultRow label="UTC / GMT" value={result.utc} onCopy={onCopy} /><ResultRow label="完整时间" value={result.zonedDateTime} onCopy={onCopy} /></dl></details>
  </section>
}

function TimestampResultView({ result, onCopy }: { result: DateTimeResult; onCopy: (value: string, label: string) => Promise<void> }) {
  return <div className="ts-stamp-result"><button onClick={() => void onCopy(result.timestampSeconds, '秒级时间戳')}><span>秒级时间戳</span><strong>{result.timestampSeconds}</strong><i>复制</i></button><button onClick={() => void onCopy(result.timestampMilliseconds, '毫秒时间戳')}><span>毫秒时间戳</span><strong>{result.timestampMilliseconds}</strong><i>复制</i></button><ResultRow label="对应 ISO" value={result.iso} onCopy={onCopy} />{result.ambiguous && <p className="ts-warning">这个时间处于夏令时重复区间，已采用较早出现的时刻。</p>}</div>
}

function ResultRow({ label, value, note, onCopy }: { label: string; value: string | null; note?: string; onCopy: (value: string, label: string) => Promise<void> }) {
  return <div><dt>{label}</dt><dd title={value ?? note}>{value ?? note}{value && note && <small>{note}</small>}</dd><button aria-label={`复制${label}`} disabled={value === null} title={value === null ? note : `复制${label}`} onClick={() => { if (value !== null) void onCopy(value, label) }}>⧉</button></div>
}

function EmptyResult({ icon, text }: { icon: 'date' | 'stamp'; text: string }) {
  return <div className="ts-empty"><TimeIcon type={icon} /><p>{text}</p></div>
}

function BatchResults({ rows, onCopy }: { rows: ReturnType<typeof convertBatch>; onCopy: (value: string, label: string) => Promise<void> }) {
  if (!rows.length) return <div className="ts-batch-empty"><TimeIcon type="date" /><strong>等待批量转换</strong><p>结果会保持输入顺序，错误行单独标记。</p></div>
  const text = rows.map((row) => row.ok ? `${row.source}\t${row.value}\t${row.iso}` : `${row.source}\tERROR\t${row.error}`).join('\n')
  return <div className="ts-batch-results"><header><span>转换结果</span><button onClick={() => void onCopy(text, '批量结果')}>复制全部</button></header><div>{rows.map((row, index) => <article className={row.ok ? '' : 'is-error'} key={`${row.source}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><code>{row.source}</code>{row.ok ? <><strong>{row.value}</strong><small>{row.iso}</small></> : <p>{row.error}</p>}</article>)}</div></div>
}

function TimeZonePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const selected = TIME_ZONES.find((zone) => zone.id === value) ?? TIME_ZONES[0]!
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { setOpen(false); return }
    if (!open || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return
    event.preventDefault()
    const options = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])]
    const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement)
    const nextIndex = event.key === 'ArrowDown'
      ? (currentIndex + 1 + options.length) % options.length
      : (currentIndex - 1 + options.length) % options.length
    options[nextIndex]?.focus()
  }
  return <div className={`ts-zone ${open ? 'is-open' : ''}`} ref={root} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }} onKeyDown={handleKeyDown}><button type="button" className="ts-zone-trigger" aria-label="选择时区" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((state) => !state)}><TimeIcon type="stamp" /><span><small>显示时区</small><strong>{selected.city}</strong></span><b>{selected.label}</b><svg className="ts-zone-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button>{open && <div className="ts-zone-menu" role="listbox" aria-label="时区选项">{TIME_ZONES.map((zone) => <button type="button" role="option" aria-selected={zone.id === value} key={zone.id} onClick={() => { onChange(zone.id); setOpen(false) }}><span>{zone.city}</span><small>{zone.id === 'local' ? Intl.DateTimeFormat().resolvedOptions().timeZone : zone.id}</small><b>{zone.label}</b></button>)}</div>}</div>
}

function unitLabel(unit: TimestampResult['detectedUnit']) {
  return { seconds: '秒级时间戳', milliseconds: '毫秒级时间戳' }[unit]
}
