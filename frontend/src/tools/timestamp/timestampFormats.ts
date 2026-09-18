import { resolveTimeZone } from './timestampModel'

export interface TimestampFormat {
  label: string
  value: string | null
  note?: string
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const formatters = new Map<string, Intl.DateTimeFormat>()
const pad = (value: number | string, length = 2) => String(value).padStart(length, '0')

function partsAt(date: Date, zone: string) {
  let formatter = formatters.get(zone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
      timeZone: zone, era: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
      weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23', timeZoneName: 'longOffset',
    })
    formatters.set(zone, formatter)
  }
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]))
  const year = parts.era === 'BC' ? 1 - Number(parts.year) : Number(parts.year)
  const yearText = year >= 0 && year <= 9999 ? pad(year, 4) : `${year < 0 ? '-' : '+'}${pad(Math.abs(year), 6)}`
  const offset = parts.timeZoneName!.replace(/^GMT/, '') || '+00:00'
  return {
    year, yearText, month: parts.month!, day: parts.day!, weekday: parts.weekday!,
    hour: parts.hour!, minute: parts.minute!, second: parts.second!, offset,
    date: `${yearText}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
  }
}

/** Format only the submitted instant; live-clock ticks do not need these extra representations. */
export function formatTimestampFormats(milliseconds: number, timeZone: string): TimestampFormat[] {
  const date = new Date(milliseconds)
  if (!Number.isFinite(date.getTime())) throw new Error('时间戳无法转换为有效日期')
  const zone = resolveTimeZone(timeZone)
  const local = partsAt(date, zone)
  // RFC numeric offsets only have minute precision. Preserve historical instants by using UTC.
  const hasMinuteOffset = /^[+-]\d{2}:\d{2}$/.test(local.offset)
  const protocol = hasMinuteOffset ? local : partsAt(date, 'UTC')
  const protocolNote = hasMinuteOffset ? undefined : '历史时区偏移包含秒，此格式改用 UTC 以保持准确'
  const compactOffset = protocol.offset.replace(':', '')
  const month = MONTHS[Number(protocol.month) - 1]!
  const localMonth = MONTHS[Number(local.month) - 1]!
  const millisecondsText = pad(date.getUTCMilliseconds(), 3)
  const rfc3339Year = protocol.year >= 0 && protocol.year <= 9999
  const rfc5322Year = protocol.year >= 1900
  return [
    { label: '常见格式', value: `${local.date} ${local.time}` },
    { label: '中文格式', value: `${local.year <= 0 ? `公元前${1 - local.year}` : local.yearText}年${local.month}月${local.day}日 ${local.hour}时${local.minute}分${local.second}秒` },
    { label: '标准时间', value: `${local.weekday} ${localMonth} ${local.day} ${local.yearText} ${local.time} GMT${hasMinuteOffset ? local.offset.replace(':', '') : local.offset} (${zone})` },
    { label: 'ISO 8601', value: date.toISOString() },
    { label: 'RFC 3339', value: rfc3339Year ? `${protocol.date}T${protocol.time}.${millisecondsText}${protocol.offset}` : null,
      note: rfc3339Year ? protocolNote : 'RFC 3339 仅支持公元 0000–9999 年' },
    { label: 'RFC 5322', value: rfc5322Year ? `${protocol.weekday}, ${protocol.day} ${month} ${protocol.year} ${protocol.time} ${compactOffset}` : null,
      note: rfc5322Year ? protocolNote : 'RFC 5322 仅支持 1900 年及以后' },
  ]
}
