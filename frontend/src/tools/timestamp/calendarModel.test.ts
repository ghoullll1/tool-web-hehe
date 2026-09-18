import { describe, expect, it } from 'vitest'
import { calendarDays, currentDateTime, dateKey, pickerInitialValue, shiftDay, shiftMonth } from './calendarModel'

describe('calendarModel', () => {
  it('builds a Monday-first six-week leap-year calendar', () => {
    const days = calendarDays(2024, 2)
    expect(days).toHaveLength(42)
    expect(dateKey(days[0]!)).toBe('2024-01-29')
    expect(dateKey(days[41]!)).toBe('2024-03-10')
    expect(days.filter((day) => day.month === 2)).toHaveLength(29)
  })

  it('clamps month navigation and preserves early years without the 1900 offset', () => {
    expect(shiftMonth({ year: 2024, month: 1, day: 31 }, 1)).toEqual({ year: 2024, month: 2, day: 29 })
    expect(shiftMonth({ year: 2024, month: 2, day: 29 }, 12)).toEqual({ year: 2025, month: 2, day: 28 })
    expect(dateKey(shiftDay({ year: 99, month: 12, day: 31 }, 1))).toBe('0100-01-01')
    expect(dateKey(shiftDay({ year: 2024, month: 3, day: 10 }, 1))).toBe('2024-03-11')
  })

  it('uses the selected timezone and keeps current milliseconds', () => {
    const now = new Date('2026-09-12T18:47:08.904Z')
    expect(currentDateTime('Asia/Shanghai', now)).toBe('2026-09-13T02:47:08.904')
    expect(currentDateTime('America/New_York', now)).toBe('2026-09-12T14:47:08.904')
  })

  it('retains a valid draft including milliseconds', () => {
    expect(pickerInitialValue('2026-09-12T14:47:08.904', 'UTC')).toEqual({ year: 2026, month: 9, day: 12, hour: 14, minute: 47, second: 8, millisecond: 904 })
  })
})
