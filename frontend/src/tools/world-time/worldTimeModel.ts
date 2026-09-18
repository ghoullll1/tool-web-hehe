export interface WorldCity {
  id: string
  name: string
  country: string
  timeZone: string
  region: '亚洲' | '欧洲' | '美洲' | '大洋洲' | '非洲'
}

export interface CityClock {
  city: WorldCity
  time: string
  seconds: string
  date: string
  weekday: string
  offset: string
  offsetMinutes: number
  hour: number
  minute: number
  isDaytime: boolean
  dayPeriod: DayPeriod
}

export type DayPeriodKey = 'dusk' | 'evening' | 'midnight' | 'deep-night' | 'pre-dawn' | 'dawn' | 'early-morning' | 'morning' | 'noon' | 'afternoon'

export interface DayPeriod {
  key: DayPeriodKey
  label: '傍晚' | '晚上' | '半夜' | '深夜' | '凌晨' | '清晨' | '早上' | '上午' | '中午' | '下午'
  range: string
  icon: string
}

export const WORLD_CITIES: readonly WorldCity[] = [
  { id: 'shanghai', name: '上海', country: '中国', timeZone: 'Asia/Shanghai', region: '亚洲' },
  { id: 'beijing', name: '北京', country: '中国', timeZone: 'Asia/Shanghai', region: '亚洲' },
  { id: 'tokyo', name: '东京', country: '日本', timeZone: 'Asia/Tokyo', region: '亚洲' },
  { id: 'seoul', name: '首尔', country: '韩国', timeZone: 'Asia/Seoul', region: '亚洲' },
  { id: 'singapore', name: '新加坡', country: '新加坡', timeZone: 'Asia/Singapore', region: '亚洲' },
  { id: 'hong-kong', name: '香港', country: '中国', timeZone: 'Asia/Hong_Kong', region: '亚洲' },
  { id: 'dubai', name: '迪拜', country: '阿联酋', timeZone: 'Asia/Dubai', region: '亚洲' },
  { id: 'kolkata', name: '加尔各答', country: '印度', timeZone: 'Asia/Kolkata', region: '亚洲' },
  { id: 'bangkok', name: '曼谷', country: '泰国', timeZone: 'Asia/Bangkok', region: '亚洲' },
  { id: 'london', name: '伦敦', country: '英国', timeZone: 'Europe/London', region: '欧洲' },
  { id: 'paris', name: '巴黎', country: '法国', timeZone: 'Europe/Paris', region: '欧洲' },
  { id: 'berlin', name: '柏林', country: '德国', timeZone: 'Europe/Berlin', region: '欧洲' },
  { id: 'moscow', name: '莫斯科', country: '俄罗斯', timeZone: 'Europe/Moscow', region: '欧洲' },
  { id: 'istanbul', name: '伊斯坦布尔', country: '土耳其', timeZone: 'Europe/Istanbul', region: '欧洲' },
  { id: 'new-york', name: '纽约', country: '美国', timeZone: 'America/New_York', region: '美洲' },
  { id: 'los-angeles', name: '洛杉矶', country: '美国', timeZone: 'America/Los_Angeles', region: '美洲' },
  { id: 'chicago', name: '芝加哥', country: '美国', timeZone: 'America/Chicago', region: '美洲' },
  { id: 'vancouver', name: '温哥华', country: '加拿大', timeZone: 'America/Vancouver', region: '美洲' },
  { id: 'toronto', name: '多伦多', country: '加拿大', timeZone: 'America/Toronto', region: '美洲' },
  { id: 'mexico-city', name: '墨西哥城', country: '墨西哥', timeZone: 'America/Mexico_City', region: '美洲' },
  { id: 'sao-paulo', name: '圣保罗', country: '巴西', timeZone: 'America/Sao_Paulo', region: '美洲' },
  { id: 'sydney', name: '悉尼', country: '澳大利亚', timeZone: 'Australia/Sydney', region: '大洋洲' },
  { id: 'melbourne', name: '墨尔本', country: '澳大利亚', timeZone: 'Australia/Melbourne', region: '大洋洲' },
  { id: 'auckland', name: '奥克兰', country: '新西兰', timeZone: 'Pacific/Auckland', region: '大洋洲' },
  { id: 'honolulu', name: '檀香山', country: '美国', timeZone: 'Pacific/Honolulu', region: '大洋洲' },
  { id: 'cairo', name: '开罗', country: '埃及', timeZone: 'Africa/Cairo', region: '非洲' },
  { id: 'johannesburg', name: '约翰内斯堡', country: '南非', timeZone: 'Africa/Johannesburg', region: '非洲' },
  { id: 'nairobi', name: '内罗毕', country: '肯尼亚', timeZone: 'Africa/Nairobi', region: '非洲' },
] as const

export const DEFAULT_WORLD_CITY_IDS = ['sydney', 'tokyo', 'beijing', 'los-angeles', 'dubai', 'london', 'paris', 'moscow', 'new-york'] as const

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>()
const displayFormatterCache = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(timeZone: string) {
  let formatter = partsFormatterCache.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    })
    partsFormatterCache.set(timeZone, formatter)
  }
  return formatter
}

function numericParts(date: Date, timeZone: string) {
  const values = Object.fromEntries(partsFormatter(timeZone).formatToParts(date).map((part) => [part.type, part.value]))
  return {
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second),
  }
}

export function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const parts = numericParts(date, timeZone)
  const representedUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return Math.round((representedUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000)
}

export function formatUtcOffset(minutes: number) {
  const sign = minutes >= 0 ? '+' : '-'
  const absolute = Math.abs(minutes)
  return `UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`
}

export function getDayPeriod(hour: number): DayPeriod {
  const normalizedHour = ((Math.floor(hour) % 24) + 24) % 24
  if (normalizedHour >= 23 || normalizedHour < 1) return { key: 'midnight', label: '半夜', range: '23:00–01:00', icon: '◑' }
  if (normalizedHour < 3) return { key: 'deep-night', label: '深夜', range: '00:00–03:00', icon: '✦' }
  if (normalizedHour < 5) return { key: 'pre-dawn', label: '凌晨', range: '03:00–05:00', icon: '✧' }
  if (normalizedHour < 7) return { key: 'dawn', label: '清晨', range: '05:00–07:00', icon: '◓' }
  if (normalizedHour < 9) return { key: 'early-morning', label: '早上', range: '07:00–09:00', icon: '◉' }
  if (normalizedHour < 12) return { key: 'morning', label: '上午', range: '09:00–12:00', icon: '☀' }
  if (normalizedHour < 14) return { key: 'noon', label: '中午', range: '12:00–14:00', icon: '●' }
  if (normalizedHour < 17) return { key: 'afternoon', label: '下午', range: '14:00–17:00', icon: '◐' }
  if (normalizedHour < 19) return { key: 'dusk', label: '傍晚', range: '17:00–19:00', icon: '◒' }
  return { key: 'evening', label: '晚上', range: '19:00–23:00', icon: '☽' }
}

export function getCityClock(city: WorldCity, instant: Date): CityClock {
  const parts = numericParts(instant, city.timeZone)
  let displayFormatter = displayFormatterCache.get(city.timeZone)
  if (!displayFormatter) {
    displayFormatter = new Intl.DateTimeFormat('zh-CN', { timeZone: city.timeZone, month: 'long', day: 'numeric', weekday: 'long' })
    displayFormatterCache.set(city.timeZone, displayFormatter)
  }
  const dateParts = displayFormatter.formatToParts(instant)
  const text = Object.fromEntries(dateParts.map((part) => [part.type, part.value]))
  const offsetMinutes = getTimeZoneOffsetMinutes(instant, city.timeZone)
  return {
    city,
    time: `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`,
    seconds: String(parts.second).padStart(2, '0'),
    date: `${text.month}月${text.day}日`,
    weekday: text.weekday ?? '',
    offsetMinutes,
    offset: formatUtcOffset(offsetMinutes),
    hour: parts.hour,
    minute: parts.minute,
    isDaytime: parts.hour >= 6 && parts.hour < 18,
    dayPeriod: getDayPeriod(parts.hour),
  }
}

export function searchWorldCities(query: string, excludedIds: readonly string[] = []) {
  const keyword = query.trim().toLocaleLowerCase()
  return WORLD_CITIES.filter((city) => !excludedIds.includes(city.id) && (!keyword || [city.name, city.country, city.timeZone, city.region].some((value) => value.toLocaleLowerCase().includes(keyword))))
}

export function parseZonedDateTime(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (!match) throw new Error('请选择完整的日期和时间')
  const wanted = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6] ?? 0) }
  const wallTimeUtc = Date.UTC(wanted.year, wanted.month - 1, wanted.day, wanted.hour, wanted.minute, wanted.second)
  let timestamp = wallTimeUtc
  for (let iteration = 0; iteration < 4; iteration += 1) {
    timestamp = wallTimeUtc - getTimeZoneOffsetMinutes(new Date(timestamp), timeZone) * 60_000
  }
  const result = new Date(timestamp)
  const actual = numericParts(result, timeZone)
  if (actual.year !== wanted.year || actual.month !== wanted.month || actual.day !== wanted.day || actual.hour !== wanted.hour || actual.minute !== wanted.minute || actual.second !== wanted.second) {
    throw new Error('该当地时间不存在，可能处于夏令时切换时段')
  }
  return result
}

export function toDateTimeLocalValue(date: Date, timeZone: string) {
  const parts = numericParts(date, timeZone)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}:${String(parts.second).padStart(2, '0')}`
}
