import { describe, expect, it } from 'vitest'
import { formatTimestampFormats } from './timestampFormats'

function formatsAt(iso: string, zone = 'UTC') {
  return Object.fromEntries(formatTimestampFormats(Date.parse(iso), zone).map((format) => [format.label, format.value]))
}

describe('timestamp output formats', () => {
  it('produces all six distinct representations in Beijing time', () => {
    expect(formatsAt('2024-01-01T00:00:00.123Z', 'Asia/Shanghai')).toEqual({
      '常见格式': '2024-01-01 08:00:00',
      '中文格式': '2024年01月01日 08时00分00秒',
      '标准时间': 'Mon Jan 01 2024 08:00:00 GMT+0800 (Asia/Shanghai)',
      'ISO 8601': '2024-01-01T00:00:00.123Z',
      'RFC 3339': '2024-01-01T08:00:00.123+08:00',
      'RFC 5322': 'Mon, 01 Jan 2024 08:00:00 +0800',
    })
  })

  it('uses midnight 00 and a known +0000 offset in UTC', () => {
    const formats = formatsAt('2024-02-29T00:00:00.007Z')
    expect(formats['常见格式']).toBe('2024-02-29 00:00:00')
    expect(formats['RFC 3339']).toBe('2024-02-29T00:00:00.007+00:00')
    expect(formats['RFC 5322']).toBe('Thu, 29 Feb 2024 00:00:00 +0000')
  })

  it('uses the selected zone weekday across day/year boundaries', () => {
    const formats = formatsAt('2024-01-01T00:00:00.123Z', 'America/New_York')
    expect(formats['常见格式']).toBe('2023-12-31 19:00:00')
    expect(formats['RFC 3339']).toBe('2023-12-31T19:00:00.123-05:00')
    expect(formats['RFC 5322']).toBe('Sun, 31 Dec 2023 19:00:00 -0500')
  })

  it.each([
    ['2024-03-10T06:59:59.999Z', '2024-03-10T01:59:59.999-05:00', '-0500'],
    ['2024-03-10T07:00:00.000Z', '2024-03-10T03:00:00.000-04:00', '-0400'],
    ['2024-11-03T05:30:00.123Z', '2024-11-03T01:30:00.123-04:00', '-0400'],
    ['2024-11-03T06:30:00.123Z', '2024-11-03T01:30:00.123-05:00', '-0500'],
  ])('preserves the instant and DST offset at %s', (iso, rfc3339, suffix) => {
    const formats = formatsAt(iso, 'America/New_York')
    expect(formats['RFC 3339']).toBe(rfc3339)
    expect(formats['RFC 5322']).toMatch(new RegExp(`${suffix}$`))
    expect(Date.parse(formats['RFC 3339']!)).toBe(Date.parse(iso))
    expect(Date.parse(formats['RFC 5322']!)).toBe(Math.floor(Date.parse(iso) / 1000) * 1000)
  })

  it('supports fractional-hour offsets and negative timestamps', () => {
    expect(formatsAt('2024-01-01T00:00:00.123Z', 'Asia/Kathmandu')['RFC 3339']).toBe('2024-01-01T05:45:00.123+05:45')
    expect(formatsAt('2024-01-01T00:00:00.123Z', 'Asia/Kathmandu')['RFC 5322']).toBe('Mon, 01 Jan 2024 05:45:00 +0545')
    expect(formatsAt('1969-12-31T23:59:59.999Z')['RFC 3339']).toBe('1969-12-31T23:59:59.999+00:00')
  })

  it('keeps historical second offsets exact by explicitly using UTC for RFC output', () => {
    const formats = formatTimestampFormats(Date.parse('1900-01-02T00:00:00.123Z'), 'Asia/Shanghai')
    expect(formats.find((format) => format.label === '常见格式')?.value).toBe('1900-01-02 08:05:43')
    expect(formats.find((format) => format.label === 'RFC 3339')).toEqual({
      label: 'RFC 3339', value: '1900-01-02T00:00:00.123+00:00', note: '历史时区偏移包含秒，此格式改用 UTC 以保持准确',
    })
    expect(formats.find((format) => format.label === 'RFC 5322')?.value).toBe('Tue, 02 Jan 1900 00:00:00 +0000')
  })

  it('does not label unsupported years as valid RFC timestamps', () => {
    expect(formatsAt('1899-01-01T00:00:00.000Z')['RFC 5322']).toBeNull()
    expect(formatsAt('0000-01-01T00:00:00.000Z')['RFC 3339']).toBe('0000-01-01T00:00:00.000+00:00')
    expect(formatsAt('-000001-01-01T00:00:00.000Z')['RFC 3339']).toBeNull()
    const future = formatsAt('+010000-01-01T00:00:00.000Z')
    expect(future['ISO 8601']).toBe('+010000-01-01T00:00:00.000Z')
    expect(future['RFC 3339']).toBeNull()
    expect(future['RFC 5322']).toBe('Sat, 01 Jan 10000 00:00:00 +0000')
  })

  it('resolves browser-local time without depending on the host zone in tests', () => {
    const ms = Date.parse('2024-01-01T00:00:00Z')
    expect(formatTimestampFormats(ms, 'local')).toEqual(formatTimestampFormats(ms, Intl.DateTimeFormat().resolvedOptions().timeZone))
    expect(() => formatTimestampFormats(NaN, 'UTC')).toThrow('有效日期')
  })
})
