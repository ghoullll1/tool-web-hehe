import { describe, expect, it } from 'vitest'
import { DEFAULT_WORLD_CITY_IDS, formatUtcOffset, getCityClock, getDayPeriod, getTimeZoneOffsetMinutes, parseZonedDateTime, searchWorldCities, WORLD_CITIES } from './worldTimeModel'

const city = (id: string) => WORLD_CITIES.find((candidate) => candidate.id === id)!

describe('worldTimeModel', () => {
  it('renders the same instant in different world cities', () => {
    const instant = new Date('2026-01-15T12:34:56Z')
    expect(getCityClock(city('shanghai'), instant).time).toBe('20:34')
    expect(getCityClock(city('new-york'), instant).time).toBe('07:34')
    expect(getCityClock(city('shanghai'), instant).seconds).toBe('56')
    expect(getCityClock(city('shanghai'), instant).date).toBe('1月15日')
  })

  it('uses daylight-saving-aware offsets', () => {
    expect(getTimeZoneOffsetMinutes(new Date('2026-01-15T12:00:00Z'), 'Europe/London')).toBe(0)
    expect(getTimeZoneOffsetMinutes(new Date('2026-07-15T12:00:00Z'), 'Europe/London')).toBe(60)
    expect(formatUtcOffset(330)).toBe('UTC+05:30')
  })

  it('converts a wall-clock time in its source timezone to an instant', () => {
    expect(parseZonedDateTime('2026-01-15T20:34', 'Asia/Shanghai').toISOString()).toBe('2026-01-15T12:34:00.000Z')
    expect(parseZonedDateTime('2026-01-15T20:34:56', 'Asia/Shanghai').toISOString()).toBe('2026-01-15T12:34:56.000Z')
    expect(() => parseZonedDateTime('', 'Asia/Shanghai')).toThrow('完整的日期和时间')
    expect(() => parseZonedDateTime('2026-03-08T02:30', 'America/New_York')).toThrow('夏令时切换')
  })

  it('searches localized names, countries, and IANA timezone ids', () => {
    expect(searchWorldCities('法国').map(({ id }) => id)).toContain('paris')
    expect(searchWorldCities('America/Los').map(({ id }) => id)).toContain('los-angeles')
    expect(searchWorldCities('东京', ['tokyo'])).toHaveLength(0)
  })

  it('uses the reference cities by default and classifies every requested day period', () => {
    expect(DEFAULT_WORLD_CITY_IDS).toEqual(['sydney', 'tokyo', 'beijing', 'los-angeles', 'dubai', 'london', 'paris', 'moscow', 'new-york'])
    expect([17, 19, 23, 0, 1, 3, 5, 7, 9, 12, 14].map((hour) => getDayPeriod(hour).label)).toEqual([
      '傍晚', '晚上', '半夜', '半夜', '深夜', '凌晨', '清晨', '早上', '上午', '中午', '下午',
    ])
    expect(getDayPeriod(0).range).toBe('23:00–01:00')
    expect(getDayPeriod(1).range).toBe('00:00–03:00')
  })
})
