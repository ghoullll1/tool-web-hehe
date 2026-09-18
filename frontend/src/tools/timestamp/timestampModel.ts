import { formatUtcOffset, getTimeZoneOffsetMinutes } from '../world-time/worldTimeModel'

export type TimestampUnit = 'auto' | 'seconds' | 'milliseconds'

export interface TimeZoneOption {
  id: string
  label: string
  city: string
}

export interface TimestampResult {
  date: Date
  detectedUnit: Exclude<TimestampUnit, 'auto'>
  timestampSeconds: string
  timestampMilliseconds: string
  iso: string
  utc: string
  zonedDate: string
  zonedTime: string
  zonedDateTime: string
  weekday: string
  offset: string
  timeZoneName: string
  relative: string
}

export interface DateTimeResult extends TimestampResult {
  ambiguous: boolean
}

export interface BatchTimestampResult {
  source: string
  ok: boolean
  value: string
  iso: string
  error?: string
}

export const MAX_BATCH_LINES = 200

export const TIME_ZONES: readonly TimeZoneOption[] = [
  { id: 'local', label: '浏览器本地', city: '本地' },
  { id: 'UTC', label: 'UTC', city: '协调世界时' },
  { id: 'Asia/Shanghai', label: 'UTC+08:00', city: '北京 / 上海' },
  { id: 'Asia/Tokyo', label: 'UTC+09:00', city: '东京' },
  { id: 'Asia/Singapore', label: 'UTC+08:00', city: '新加坡' },
  { id: 'Europe/London', label: 'UTC±夏令时', city: '伦敦' },
  { id: 'Europe/Paris', label: 'UTC+01:00', city: '巴黎' },
  { id: 'America/New_York', label: 'UTC-05:00', city: '纽约' },
  { id: 'America/Los_Angeles', label: 'UTC-08:00', city: '洛杉矶' },
  { id: 'Australia/Sydney', label: 'UTC+10:00', city: '悉尼' },
] as const

const dateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>()
const dateFormatterCache = new Map<string, Intl.DateTimeFormat>()
const timeFormatterCache = new Map<string, Intl.DateTimeFormat>()
const partsFormatterCache = new Map<string, Intl.DateTimeFormat>()

export function resolveTimeZone(timeZone: string) {
  return timeZone === 'local' ? Intl.DateTimeFormat().resolvedOptions().timeZone : timeZone
}

function cachedFormatter(cache: Map<string, Intl.DateTimeFormat>, timeZone: string, options: Intl.DateTimeFormatOptions) {
  const key = resolveTimeZone(timeZone)
  let formatter = cache.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('zh-CN', { timeZone: key, ...options })
    cache.set(key, formatter)
  }
  return formatter
}

function detectUnit(value: string): Exclude<TimestampUnit, 'auto'> {
  if (value.includes('.')) return 'seconds'
  const digits = value.replace(/^[+-]/, '').replace(/^0+/, '').length
  return digits <= 10 ? 'seconds' : 'milliseconds'
}

export function parseTimestamp(value: string, unit: TimestampUnit = 'auto') {
  const normalized = value.trim()
  const match = /^([+-]?)(\d{1,20})(?:\.(\d{1,3}))?$/.exec(normalized)
  if (!match) throw new Error('请输入秒或毫秒时间戳，秒最多支持 3 位小数')
  const detectedUnit = unit === 'auto' ? detectUnit(normalized) : unit
  if (detectedUnit === 'milliseconds' && match[3] !== undefined) throw new Error('毫秒时间戳必须为整数')
  const sign = match[1] === '-' ? -1n : 1n
  const whole = BigInt(match[2]!)
  const milliseconds = sign * (detectedUnit === 'seconds'
    ? whole * 1_000n + BigInt((match[3] ?? '').padEnd(3, '0'))
    : whole)
  const maximum = 8_640_000_000_000_000n
  if (milliseconds < -maximum || milliseconds > maximum) throw new Error('时间戳超出浏览器可表示的日期范围')
  const date = new Date(Number(milliseconds))
  if (Number.isNaN(date.getTime())) throw new Error('时间戳无法转换为有效日期')
  return { date, detectedUnit }
}

/** Auto only detects the existing input; explicit units convert its representation. */
export function convertTimestampUnit(value: string, from: TimestampUnit, to: TimestampUnit) {
  if (to === 'auto') return value
  const milliseconds = BigInt(parseTimestamp(value, from).date.getTime())
  if (to === 'milliseconds') return milliseconds.toString()
  const absolute = milliseconds < 0n ? -milliseconds : milliseconds
  const wholeSeconds = (absolute / 1_000n).toString()
  const fraction = (absolute % 1_000n).toString().padStart(3, '0').replace(/0+$/, '')
  return `${milliseconds < 0n ? '-' : ''}${wholeSeconds}${fraction ? `.${fraction}` : ''}`
}

export function convertBatchUnit(input: string, from: TimestampUnit, to: TimestampUnit) {
  if (to === 'auto') return input
  const lines = input.split(/\r?\n/)
  if (lines.filter((line) => line.trim()).length > MAX_BATCH_LINES) throw new Error(`一次最多转换 ${MAX_BATCH_LINES} 行`)
  return lines.map((line) => {
    if (!line.trim()) return line
    try { return convertTimestampUnit(line, from, to) }
    catch { return line } // Keep invalid rows editable and let batch validation report them.
  }).join('\n')
}

function formatRelative(date: Date, now: Date) {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000)
  const absolute = Math.abs(seconds)
  const [value, unit]: [number, Intl.RelativeTimeFormatUnit] = absolute < 60
    ? [seconds, 'second'] : absolute < 3_600
      ? [Math.round(seconds / 60), 'minute'] : absolute < 86_400
        ? [Math.round(seconds / 3_600), 'hour'] : absolute < 2_592_000
          ? [Math.round(seconds / 86_400), 'day'] : absolute < 31_536_000
            ? [Math.round(seconds / 2_592_000), 'month'] : [Math.round(seconds / 31_536_000), 'year']
  return new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' }).format(value, unit)
}

function timestampStrings(date: Date) {
  const milliseconds = BigInt(date.getTime())
  const seconds = milliseconds >= 0n ? milliseconds / 1_000n : (milliseconds - 999n) / 1_000n
  return { timestampMilliseconds: milliseconds.toString(), timestampSeconds: seconds.toString() }
}

export function formatTimestamp(date: Date, timeZone: string, now = new Date(), parsed?: Pick<ReturnType<typeof parseTimestamp>, 'detectedUnit'>): TimestampResult {
  const zone = resolveTimeZone(timeZone)
  const dateOptions: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' }
  const timeOptions: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hourCycle: 'h23' }
  const fullOptions: Intl.DateTimeFormatOptions = { ...dateOptions, ...timeOptions, weekday: 'long', timeZoneName: 'long' }
  const dateTimeFormatter = cachedFormatter(dateTimeFormatterCache, zone, fullOptions)
  const namePart = dateTimeFormatter.formatToParts(date).find((part) => part.type === 'timeZoneName')?.value ?? zone
  const weekday = dateTimeFormatter.formatToParts(date).find((part) => part.type === 'weekday')?.value ?? ''
  return {
    date,
    detectedUnit: parsed?.detectedUnit ?? 'milliseconds',
    ...timestampStrings(date),
    iso: date.toISOString(),
    utc: date.toUTCString(),
    zonedDate: cachedFormatter(dateFormatterCache, zone, dateOptions).format(date),
    zonedTime: cachedFormatter(timeFormatterCache, zone, timeOptions).format(date),
    zonedDateTime: dateTimeFormatter.format(date),
    weekday,
    offset: formatUtcOffset(getTimeZoneOffsetMinutes(date, zone)),
    timeZoneName: namePart,
    relative: formatRelative(date, now),
  }
}

export function timestampToResult(value: string, unit: TimestampUnit, timeZone: string, now = new Date()) {
  const parsed = parseTimestamp(value, unit)
  return formatTimestamp(parsed.date, timeZone, now, parsed)
}

interface WallParts { year: number; month: number; day: number; hour: number; minute: number; second: number; millisecond: number }

function wallAsUtc(parts: WallParts) {
  const date = new Date(0)
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day)
  date.setUTCHours(parts.hour, parts.minute, parts.second, parts.millisecond)
  return date
}

export function parseWallDateTime(value: string): WallParts {
  const match = /^(\d{4,6})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value.trim())
  if (!match) throw new Error('请输入完整日期和时间')
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6] ?? 0), millisecond: Number((match[7] ?? '').padEnd(3, '0')) }
  const utc = wallAsUtc(parts)
  if (utc.getUTCFullYear() !== parts.year || utc.getUTCMonth() + 1 !== parts.month || utc.getUTCDate() !== parts.day || utc.getUTCHours() !== parts.hour || utc.getUTCMinutes() !== parts.minute || utc.getUTCSeconds() !== parts.second) throw new Error('日期或时间超出有效范围')
  return parts
}

function wallParts(date: Date, timeZone: string): WallParts {
  const zone = resolveTimeZone(timeZone)
  let formatter = partsFormatterCache.get(zone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hourCycle: 'h23' })
    partsFormatterCache.set(zone, formatter)
  }
  const values = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]))
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day), hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second), millisecond: Number(values.fractionalSecond) }
}

function sameWall(left: WallParts, right: WallParts) {
  return left.year === right.year && left.month === right.month && left.day === right.day && left.hour === right.hour && left.minute === right.minute && left.second === right.second && left.millisecond === right.millisecond
}

export function dateTimeToResult(value: string, timeZone: string, now = new Date()): DateTimeResult {
  const target = parseWallDateTime(value)
  const zone = resolveTimeZone(timeZone)
  const wallUtc = wallAsUtc(target).getTime()
  const offsets = new Set<number>()
  for (let shift = -36; shift <= 36; shift += 6) offsets.add(getTimeZoneOffsetMinutes(new Date(wallUtc + shift * 3_600_000), zone))
  const candidates = [...offsets].map((offset) => new Date(wallUtc - offset * 60_000)).filter((candidate) => sameWall(wallParts(candidate, zone), target)).sort((left, right) => left.getTime() - right.getTime())
  if (!candidates.length) throw new Error('所选时区不存在这个本地时间，可能处于夏令时跳变区间')
  return { ...formatTimestamp(candidates[0]!, zone, now), ambiguous: candidates.length > 1 }
}

export function formatDateTimeInput(date: Date, timeZone: string) {
  const parts = wallParts(date, timeZone)
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}:${String(parts.second).padStart(2, '0')}`
}

export function convertBatch(input: string, unit: TimestampUnit, timeZone: string): BatchTimestampResult[] {
  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (!lines.length) throw new Error('请至少输入一个时间戳')
  if (lines.length > MAX_BATCH_LINES) throw new Error(`一次最多转换 ${MAX_BATCH_LINES} 行`)
  return lines.map((source) => {
    try {
      const result = timestampToResult(source, unit, timeZone)
      return { source, ok: true, value: `${result.zonedDate} ${result.zonedTime}`, iso: result.iso }
    } catch (error) {
      return { source, ok: false, value: '', iso: '', error: error instanceof Error ? error.message : '转换失败' }
    }
  })
}
