import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { ToolViewProps } from '../registry'
import DateTimePicker from '../timestamp/DateTimePicker'
import {
  DEFAULT_WORLD_CITY_IDS,
  getCityClock,
  parseZonedDateTime,
  searchWorldCities,
  toDateTimeLocalValue,
  WORLD_CITIES,
  type DayPeriod,
} from './worldTimeModel'
import WorldCityPicker from './WorldCityPicker'

const STORAGE_KEY = 'tool-web.world-time.cities.v2'
const LEGACY_DEFAULT_WORLD_CITY_IDS = ['sydney', 'tokyo', 'beijing', 'singapore', 'dubai', 'london', 'paris', 'moscow', 'new-york'] as const
const MAX_CITIES = 12
type TimeMode = 'live' | 'planned'
type Notice = { tone: 'neutral' | 'success' | 'error'; message: string }

function PeriodIcon({ period }: { period: DayPeriod }) {
  return <span className={`world-period-icon is-${period.key}`} aria-hidden="true">{period.icon}</span>
}

const DAY_BAND_SEGMENTS = [
  { key: 'midnight', label: '半夜', range: '23:00–01:00', hours: 1 },
  { key: 'deep-night', label: '深夜', range: '00:00–03:00', hours: 2 },
  { key: 'pre-dawn', label: '凌晨', range: '03:00–05:00', hours: 2 },
  { key: 'dawn', label: '清晨', range: '05:00–07:00', hours: 2 },
  { key: 'early-morning', label: '早上', range: '07:00–09:00', hours: 2 },
  { key: 'morning', label: '上午', range: '09:00–12:00', hours: 3 },
  { key: 'noon', label: '中午', range: '12:00–14:00', hours: 2 },
  { key: 'afternoon', label: '下午', range: '14:00–17:00', hours: 3 },
  { key: 'dusk', label: '傍晚', range: '17:00–19:00', hours: 2 },
  { key: 'evening', label: '晚上', range: '19:00–23:00', hours: 4 },
  { key: 'midnight', label: '半夜', range: '23:00–01:00', hours: 1 },
] as const

const DAY_BAND_TICKS = [0, 6, 12, 18, 24] as const

function DayPeriodBand({ activePeriod }: { activePeriod?: DayPeriod['key'] }) {
  return <div className="world-day-band" aria-label="24 小时时段刻度">
    {DAY_BAND_SEGMENTS.map((segment, index) => <i key={`${segment.key}-${index}`} className={`is-${segment.key}${activePeriod === segment.key ? ' is-selected' : ''}`} style={{ flexGrow: segment.hours }} title={`${segment.label} ${segment.range}`} />)}
  </div>
}

function DayPeriodAxis() {
  return <div className="world-period-axis" aria-hidden="true">{DAY_BAND_TICKS.map((hour) => <span key={hour} style={{ '--tick-position': `${hour / 24 * 100}%` } as CSSProperties}>{String(hour).padStart(2, '0')}</span>)}</div>
}

function loadCityIds() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (Array.isArray(stored)) {
      const valid = stored.filter((id): id is string => typeof id === 'string' && WORLD_CITIES.some((city) => city.id === id))
      if (valid.length) {
        const unique = [...new Set(valid)].slice(0, MAX_CITIES)
        const isUntouchedLegacyDefault = unique.length === LEGACY_DEFAULT_WORLD_CITY_IDS.length
          && unique.every((id, index) => id === LEGACY_DEFAULT_WORLD_CITY_IDS[index])
        return isUntouchedLegacyDefault ? [...DEFAULT_WORLD_CITY_IDS] : unique
      }
    }
  } catch { /* Fall back to defaults when browser storage is unavailable or malformed. */ }
  return [...DEFAULT_WORLD_CITY_IDS]
}

export default function WorldTimeTool({ tool }: ToolViewProps) {
  const [cityIds, setCityIds] = useState<string[]>(loadCityIds)
  const [mode, setMode] = useState<TimeMode>('live')
  const [now, setNow] = useState(() => new Date())
  const [plannedValue, setPlannedValue] = useState('')
  const [sourceCityId, setSourceCityId] = useState(() => cityIds.includes('beijing') ? 'beijing' : cityIds[0] ?? 'shanghai')
  const [query, setQuery] = useState('')
  const [previewCityId, setPreviewCityId] = useState<string | null>(null)
  const [pinnedCityId, setPinnedCityId] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice>({ tone: 'neutral', message: '所有城市时钟正在同步运行' })

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cityIds)) } catch { /* Persistence is optional. */ }
  }, [cityIds])

  const cities = useMemo(() => cityIds.map((id) => WORLD_CITIES.find((city) => city.id === id)).filter((city) => city !== undefined), [cityIds])
  const sourceCity = WORLD_CITIES.find((city) => city.id === sourceCityId) ?? cities[0] ?? WORLD_CITIES[0]!
  const planned = useMemo(() => {
    if (mode !== 'planned') return { instant: null, error: null }
    try { return { instant: parseZonedDateTime(plannedValue, sourceCity.timeZone), error: null } }
    catch (error) { return { instant: null, error: error instanceof Error ? error.message : '时间转换失败' } }
  }, [mode, plannedValue, sourceCity.timeZone])
  const instant = mode === 'live' ? now : planned.instant
  const clocks = useMemo(() => instant ? cities.map((city) => getCityClock(city, instant)) : [], [cities, instant])
  const timelineLanes = useMemo(() => {
    const laneOrder = [0, 2, 1, 3] as const
    return new Map([...clocks]
      .sort((first, second) => (first.hour * 60 + first.minute) - (second.hour * 60 + second.minute))
      .map((clock, index) => [clock.city.id, laneOrder[index % laneOrder.length]]))
  }, [clocks])
  const activeTimelineClock = clocks.find((clock) => clock.city.id === previewCityId)
    ?? clocks.find((clock) => clock.city.id === pinnedCityId)
  const candidates = useMemo(() => searchWorldCities(query, cityIds).slice(0, query ? 10 : 6), [cityIds, query])
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
  const localClock = getCityClock({ id: 'local', name: '本地时间', country: '当前设备', timeZone: localZone, region: '亚洲' }, now)

  function chooseMode(nextMode: TimeMode) {
    if (nextMode === 'planned' && !plannedValue) setPlannedValue(toDateTimeLocalValue(new Date(), sourceCity.timeZone))
    if (nextMode === 'live') setNow(new Date())
    setMode(nextMode)
    setNotice({ tone: 'neutral', message: nextMode === 'live' ? '已回到当前实时世界时间' : '调整日期时间，所有城市会同步换算' })
  }

  function addCity(id: string) {
    if (cityIds.length >= MAX_CITIES) {
      setNotice({ tone: 'error', message: `最多同时比较 ${MAX_CITIES} 个城市` })
      return
    }
    const city = WORLD_CITIES.find((candidate) => candidate.id === id)
    if (!city || cityIds.includes(id)) return
    setCityIds((current) => [...current, id])
    setQuery('')
    setNotice({ tone: 'success', message: `已添加${city.name}，选择会保存在当前浏览器` })
  }

  function removeCity(id: string) {
    if (cityIds.length === 1) {
      setNotice({ tone: 'error', message: '请至少保留一个城市' })
      return
    }
    setCityIds((current) => current.filter((candidate) => candidate !== id))
    if (previewCityId === id) setPreviewCityId(null)
    if (pinnedCityId === id) setPinnedCityId(null)
    if (sourceCityId === id) setSourceCityId(cityIds.find((candidate) => candidate !== id) ?? 'shanghai')
    setNotice({ tone: 'neutral', message: '城市已从时间面板移除' })
  }

  async function copyTimes() {
    if (!clocks.length) return
    const content = clocks.map((clock) => `${clock.city.name} ${clock.time}:${clock.seconds} · ${clock.date} ${clock.weekday} · ${clock.offset}`).join('\n')
    try {
      await navigator.clipboard.writeText(content)
      setNotice({ tone: 'success', message: '所有城市时间已复制' })
    } catch {
      setNotice({ tone: 'error', message: '复制失败，请检查浏览器剪贴板权限' })
    }
  }

  const activeError = mode === 'planned' ? planned.error : null

  return (
    <div className="world-time-tool" data-tool={tool.slug}>
      <div className={`world-time-notice is-${activeError ? 'error' : notice.tone}`} role={activeError || notice.tone === 'error' ? 'alert' : 'status'}>
        <span aria-hidden="true">{activeError ? '!' : notice.tone === 'success' ? '✓' : '◷'}</span>
        <p>{activeError ?? notice.message}</p>
        <b>浏览器本地换算 · 自动处理夏令时</b>
      </div>

      <section className="world-time-hero">
        <div className={`world-local-clock is-${localClock.isDaytime ? 'day' : 'night'}`}>
          <header><span><i /> 本地时间</span><b>24H</b></header>
          <div><strong>{localClock.time}</strong><span>:{localClock.seconds}</span></div>
          <p>{localClock.date} · {localClock.weekday}</p>
          <footer><span>{localZone}</span><b>{localClock.offset}</b></footer>
        </div>
        <div className={`world-global-overview${activeTimelineClock ? ' has-active-city' : ''}`} onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setPreviewCityId(null)
            setPinnedCityId(null)
            if (event.target instanceof HTMLElement) event.target.blur()
          }
        }}>
          <header><div><small>GLOBAL TIMELINE</small><h2>全球时刻</h2></div><p>{clocks.length} 个城市 · 悬浮预览，点击锁定</p></header>
          <div className="world-timeline-inspector">
            {activeTimelineClock ? <>
              <div><strong>{activeTimelineClock.city.name}</strong><span>{activeTimelineClock.city.country}</span></div>
              <b>{activeTimelineClock.time}<small>:{activeTimelineClock.seconds}</small></b>
              <p><PeriodIcon period={activeTimelineClock.dayPeriod} />{activeTimelineClock.dayPeriod.label} · {activeTimelineClock.dayPeriod.range}<span>{activeTimelineClock.offset}</span></p>
              <em>{pinnedCityId === activeTimelineClock.city.id ? '已锁定 · 按 Esc 退出' : '正在预览'}</em>
            </> : <p className="world-timeline-hint"><span aria-hidden="true">◎</span> 将指针移到城市上查看时段，点击后可固定对照</p>}
          </div>
          <div className="world-global-track">
            <DayPeriodBand activePeriod={activeTimelineClock?.dayPeriod.key} />
            {activeTimelineClock && <div className="world-timeline-lens" aria-hidden="true" style={{ '--marker-position': `${(activeTimelineClock.hour * 60 + activeTimelineClock.minute) / 14.4}%` } as CSSProperties} />}
            {clocks.map((clock) => {
              const isPinned = pinnedCityId === clock.city.id
              const isActive = activeTimelineClock?.city.id === clock.city.id
              return <button
                type="button"
                key={clock.city.id}
                className={`world-global-marker lane-${timelineLanes.get(clock.city.id) ?? 0}${isActive ? ' is-active' : ''}${isPinned ? ' is-pinned' : ''}`}
                style={{ '--marker-position': `${(clock.hour * 60 + clock.minute) / 14.4}%` } as CSSProperties}
                aria-label={`${clock.city.name} ${clock.time}，${clock.dayPeriod.label}；${isPinned ? '取消锁定' : '点击锁定'}`}
                aria-pressed={isPinned}
                onMouseEnter={() => setPreviewCityId(clock.city.id)}
                onMouseLeave={() => setPreviewCityId(null)}
                onFocus={() => setPreviewCityId(clock.city.id)}
                onBlur={() => setPreviewCityId(null)}
                onClick={() => setPinnedCityId((current) => current === clock.city.id ? null : clock.city.id)}
              ><span /><span className="world-global-marker-label"><b>{clock.city.name}</b><small title={`${clock.dayPeriod.label} ${clock.dayPeriod.range}`}><PeriodIcon period={clock.dayPeriod} /><time>{clock.time}</time></small></span></button>
            })}
          </div>
          <DayPeriodAxis />
        </div>
      </section>

      <section className="world-time-control">
        <div className="world-time-mode" aria-label="时间模式">
          <button type="button" className={mode === 'live' ? 'is-active' : ''} aria-pressed={mode === 'live'} onClick={() => chooseMode('live')}><i />当前时间</button>
          <button type="button" className={mode === 'planned' ? 'is-active' : ''} aria-pressed={mode === 'planned'} onClick={() => chooseMode('planned')}>指定时间</button>
        </div>
        {mode === 'planned' && <div className="world-time-planner">
          <DateTimePicker className="world-planner-date" label="当地日期与时间" value={plannedValue} timeZone={sourceCity.timeZone} precision="seconds" readOnly onChange={setPlannedValue} />
          <WorldCityPicker cities={cities} value={sourceCity.id} referenceDate={planned.instant ?? now} onChange={setSourceCityId} />
        </div>}
        <button className="world-time-copy" type="button" disabled={!clocks.length} onClick={() => void copyTimes()}>复制全部时间</button>
      </section>

      <section className="world-time-library">
        <header><div><span>01</span><h2>添加城市</h2></div><p>{cityIds.length} / {MAX_CITIES} 个时钟</p></header>
        <label className="world-city-search"><span aria-hidden="true">⌕</span><input type="search" aria-label="搜索城市或时区" placeholder="搜索城市、国家或 IANA 时区，例如 Tokyo" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" aria-label="清空城市搜索" onClick={() => setQuery('')}>×</button>}</label>
        <div className="world-city-suggestions" aria-label={query ? '搜索结果' : '推荐城市'}>
          {candidates.map((city) => <button type="button" key={city.id} onClick={() => addCity(city.id)}><span>{city.name}</span><small>{city.country} · {city.timeZone}</small><b>＋</b></button>)}
          {!candidates.length && <p>没有找到可添加的城市，或者它已经在时间面板中。</p>}
        </div>
      </section>

      <section className="world-clock-section">
        <header><div><span>02</span><h2>{mode === 'live' ? '世界时间 · 实时' : '世界时间 · 换算结果'}</h2></div><p>同一时刻，不同时区</p></header>
        <div className="world-clock-list">
          {clocks.map((clock, index) => {
            const minuteOfDay = clock.hour * 60 + clock.minute
            const localDifference = clock.offsetMinutes - localClock.offsetMinutes
            const differenceText = localDifference === 0 ? '与本地相同' : `比本地${localDifference > 0 ? '快' : '慢'} ${Math.abs(localDifference) / 60} 小时`
            return <article key={clock.city.id} className="world-city-row" style={{ '--clock-index': index, '--day-progress': `${minuteOfDay / 14.4}%` } as CSSProperties}>
              <div className="world-city-identity"><small>{clock.city.region}</small><h3>{clock.city.name}</h3><p>{clock.city.country}</p></div>
              <div className="world-city-timeline"><DayPeriodBand /><span aria-hidden="true" /><div><small>00</small><small>06</small><small>12</small><small>18</small><small>24</small></div></div>
              <div className="world-city-exact"><strong>{clock.time}</strong><span>:{clock.seconds}</span><p>{clock.date} · {clock.weekday}</p></div>
              <div className="world-city-offset"><b><PeriodIcon period={clock.dayPeriod} />{clock.dayPeriod.label}</b><span>{clock.dayPeriod.range}</span><small>{clock.offset} · {differenceText}</small></div>
              <button type="button" aria-label={`移除${clock.city.name}`} onClick={() => removeCity(clock.city.id)}>×</button>
            </article>
          })}
          {!clocks.length && <div className="world-clock-empty"><span>◷</span><h3>等待有效时间</h3><p>请检查指定的当地时间。</p></div>}
        </div>
      </section>

      <p className="world-time-footnote"><strong>说明：</strong>时区和夏令时规则由当前浏览器提供；未来日期的结果可能因各地区后续调整规则而变化。</p>
    </div>
  )
}
