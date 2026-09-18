import { formatDateTimeInput, parseWallDateTime } from './timestampModel'

export interface CalendarDate { year: number; month: number; day: number }
export const pad = (value: number | string, length = 2) => String(value).padStart(length, '0')
export const dateKey = ({ year, month, day }: CalendarDate) => `${pad(year, 4)}-${pad(month)}-${pad(day)}`

// UTC arithmetic treats calendar dates as civil days, independent of DST changes.
function civilDate({ year, month, day }: CalendarDate) {
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  return date
}

function fromDate(date: Date): CalendarDate {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

export function shiftDay(date: CalendarDate, offset: number) {
  const next = civilDate(date)
  next.setUTCDate(next.getUTCDate() + offset)
  return fromDate(next)
}

export function shiftMonth(date: CalendarDate, offset: number) {
  const first = civilDate({ ...date, day: 1 })
  first.setUTCMonth(first.getUTCMonth() + offset)
  const last = new Date(first)
  last.setUTCMonth(last.getUTCMonth() + 1, 0)
  first.setUTCDate(Math.min(date.day, last.getUTCDate()))
  return fromDate(first)
}

export function calendarDays(year: number, month: number) {
  const first = { year, month, day: 1 }
  const mondayOffset = (civilDate(first).getUTCDay() + 6) % 7
  return Array.from({ length: 42 }, (_, index) => shiftDay(first, index - mondayOffset))
}

export function currentDateTime(timeZone: string, now = new Date()) {
  return `${formatDateTimeInput(now, timeZone)}.${pad(now.getMilliseconds(), 3)}`
}

export function pickerInitialValue(value: string, timeZone: string) {
  try {
    const parsed = parseWallDateTime(value)
    if (parsed.year >= 1 && parsed.year <= 9999) return parsed
  } catch { /* An invalid manual value remains untouched until the picker is applied. */ }
  return parseWallDateTime(currentDateTime(timeZone))
}
