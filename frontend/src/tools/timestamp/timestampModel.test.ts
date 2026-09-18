import { describe, expect, it } from 'vitest'
import { convertBatch, convertBatchUnit, convertTimestampUnit, dateTimeToResult, parseTimestamp, timestampToResult } from './timestampModel'

describe('timestampModel', () => {
  it('recognizes second and millisecond timestamps without numeric precision loss', () => {
    expect(timestampToResult('1704067200', 'auto', 'UTC').iso).toBe('2024-01-01T00:00:00.000Z')
    expect(timestampToResult('1704067200000', 'auto', 'UTC').iso).toBe('2024-01-01T00:00:00.000Z')
    expect(timestampToResult('-1', 'milliseconds', 'UTC').timestampSeconds).toBe('-1')
  })

  it('switches units while preserving the same instant from the reported example', () => {
    const milliseconds = convertTimestampUnit('1789195154', 'auto', 'milliseconds')
    expect(milliseconds).toBe('1789195154000')
    expect(timestampToResult(milliseconds, 'milliseconds', 'Asia/Shanghai').zonedTime).toBe('14:39:14.000')
    expect(convertTimestampUnit(milliseconds, 'milliseconds', 'seconds')).toBe('1789195154')
  })

  it.each(['1789195154123', '-1', '1000', '-1789195154123'])('preserves millisecond precision when switching %s through seconds and back', (input) => {
    const seconds = convertTimestampUnit(input, 'milliseconds', 'seconds')
    expect(parseTimestamp(seconds, 'seconds').date.getTime()).toBe(parseTimestamp(input, 'milliseconds').date.getTime())
    expect(convertTimestampUnit(seconds, 'seconds', 'milliseconds')).toBe(input)
  })

  it.each(['1789195628904', '1789195628', '1789195628.904', '  +001789195628904  ', '-1', '1000', 'invalid', ''])('never rewrites %s when enabling automatic detection', (input) => {
    expect(convertTimestampUnit(input, 'milliseconds', 'auto')).toBe(input)
    expect(convertTimestampUnit(input, 'seconds', 'auto')).toBe(input)
  })

  it('preserves batch text exactly when enabling auto, while keeping the execution limit', () => {
    const input = ' 1789195628904 \r\n\r\n1789195628.904\r\ninvalid\r\n'
    expect(convertBatchUnit(input, 'milliseconds', 'auto')).toBe(input)
    const oversized = Array(201).fill('1789195628904').join('\r\n')
    expect(convertBatchUnit(oversized, 'milliseconds', 'auto')).toBe(oversized)
    expect(() => convertBatch(oversized, 'auto', 'UTC')).toThrow('200')
  })

  it('supports at most millisecond precision and rejects invalid or out-of-range inputs', () => {
    expect(parseTimestamp('1789195154.123', 'seconds').date.toISOString()).toBe('2026-09-12T06:39:14.123Z')
    expect(() => parseTimestamp('1789195154.1234', 'seconds')).toThrow('3 位小数')
    expect(() => parseTimestamp('1789195154123.5', 'milliseconds')).toThrow('必须为整数')
    expect(() => parseTimestamp('8640000000000001', 'milliseconds')).toThrow('超出')
    expect(() => parseTimestamp('not-a-time')).toThrow('请输入')
  })

  it('converts mixed batch units without losing blank or invalid rows', () => {
    const input = '1789195154\n\n1789195154123\nbad'
    const converted = convertBatchUnit(input, 'auto', 'milliseconds')
    expect(converted).toBe('1789195154000\n\n1789195154123\nbad')
    expect(convertBatch(converted, 'milliseconds', 'UTC').map((row) => row.iso))
      .toEqual(convertBatch(input, 'auto', 'UTC').map((row) => row.iso))
    expect(() => convertBatchUnit(Array(201).fill('1789195154').join('\n'), 'auto', 'seconds')).toThrow('200')
  })

  it('formats an instant in the selected timezone', () => {
    const result = timestampToResult('1704067200', 'seconds', 'Asia/Shanghai')
    expect(result.zonedDate).toBe('2024/01/01')
    expect(result.zonedTime).toBe('08:00:00.000')
    expect(result.offset).toBe('UTC+08:00')
  })

  it('converts timezone wall time and handles daylight-saving boundaries', () => {
    expect(dateTimeToResult('2024-01-01T08:00:00.000', 'Asia/Shanghai').timestampMilliseconds).toBe('1704067200000')
    expect(() => dateTimeToResult('2024-03-10T02:30:00.000', 'America/New_York')).toThrow('夏令时')
    const overlap = dateTimeToResult('2024-11-03T01:30:00.000', 'America/New_York')
    expect(overlap.iso).toBe('2024-11-03T05:30:00.000Z')
    expect(overlap.ambiguous).toBe(true)
  })

  it('keeps batch order and isolates invalid rows', () => {
    const rows = convertBatch('1704067200\nnot-a-time\n1704067201000', 'auto', 'UTC')
    expect(rows).toHaveLength(3)
    expect(rows[0]?.ok).toBe(true)
    expect(rows[1]?.ok).toBe(false)
    expect(rows[2]?.iso).toBe('2024-01-01T00:00:01.000Z')
  })
})
