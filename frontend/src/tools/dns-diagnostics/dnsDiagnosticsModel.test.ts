import { describe, expect, it } from 'vitest'
import { comparisonLabel, formatTtl, resolverStatusLabel } from './dnsDiagnosticsModel'

describe('dns diagnostics model', () => {
  it('formats operational TTL values without shrinking to raw seconds', () => {
    expect(formatTtl(null)).toBe('—')
    expect(formatTtl(45)).toBe('45 秒')
    expect(formatTtl(125)).toBe('2 分 5 秒')
    expect(formatTtl(7200)).toBe('2 小时')
  })

  it('keeps resolver and comparison states readable', () => {
    expect(comparisonLabel('DIVERGENT')).toBe('发现差异')
    expect(comparisonLabel('UNAVAILABLE')).toBe('不可用')
    expect(resolverStatusLabel('PARTIAL')).toBe('部分完成')
  })
})
