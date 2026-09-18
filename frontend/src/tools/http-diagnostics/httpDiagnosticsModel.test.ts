import { describe, expect, it } from 'vitest'
import { describeHeader, formatBytes, parseDiagnosticsResult, prepareDiagnosticUrl, statusTone } from './httpDiagnosticsModel'

describe('http diagnostics model', () => {
  it('maps HTTP status families to stable visual tones', () => {
    expect(statusTone(204)).toBe('success')
    expect(statusTone(301)).toBe('redirect')
    expect(statusTone(404)).toBe('warning')
    expect(statusTone(503)).toBe('error')
  })

  it('formats response sizes without inventing missing values', () => {
    expect(formatBytes(null)).toBe('未声明')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
  })

  it('rejects malformed server output', () => {
    expect(() => parseDiagnosticsResult({ status: 200 })).toThrow('无法识别')
  })

  it('explains standard and extension response headers', () => {
    expect(describeHeader('Content-Security-Policy')).toEqual(expect.objectContaining({ category: '安全' }))
    expect(describeHeader('X-Vendor-Trace').description).toContain('扩展响应元数据')
  })

  it('removes browser-only fragments and scrubs embedded URL credentials', () => {
    expect(prepareDiagnosticUrl(' https://service.example.com/#/login ')).toEqual({
      url: 'https://service.example.com/', fragmentRemoved: true, embeddedCredentials: false,
    })
    expect(prepareDiagnosticUrl('https://alice:secret@example.com/private')).toEqual({
      url: 'https://example.com/private', fragmentRemoved: false, embeddedCredentials: true,
    })
  })
})
