import { describe, expect, it, vi } from 'vitest'
import { buildRequestBody, buildRequestHeaders, buildRequestUrl, executeApiRequest, formatResponseBody, generateRequestCode, type ApiRequestConfig, type ParameterValueType } from './apiTestModel'

const row = (key: string, value: string, enabled = true, valueType: ParameterValueType = 'string') => ({ id: key, key, value, enabled, valueType })
const baseConfig: ApiRequestConfig = {
  method: 'POST', url: 'https://example.com/items?existing=yes', query: [row('page', '2'), row('skip', 'x', false)], headers: [row('Accept', 'application/json')],
  bodyType: 'json', bodyText: '{"hello":"world"}', bodyFields: [], authType: 'none', authToken: '', authUsername: '', authPassword: '', apiKeyName: '', apiKeyValue: '', apiKeyLocation: 'header', timeoutMs: 30_000,
}

describe('apiTestModel', () => {
  it('builds encoded query parameters without losing existing values', () => {
    expect(buildRequestUrl(baseConfig.url, baseConfig.query, baseConfig)).toBe('https://example.com/items?existing=yes&page=2')
  })

  it('validates and serializes selectable query parameter types', () => {
    const url = new URL(buildRequestUrl(baseConfig.url, [
      row('ratio', '1.25', true, 'number'),
      row('enabled', 'TRUE', true, 'boolean'),
      row('filter', '{ "requestId": 9223372036854775807 }', true, 'json'),
    ], baseConfig))
    expect(url.searchParams.get('ratio')).toBe('1.25')
    expect(url.searchParams.get('enabled')).toBe('true')
    expect(url.searchParams.get('filter')).toBe('{"requestId":9223372036854775807}')
    expect(() => buildRequestUrl(baseConfig.url, [row('page', 'one', true, 'number')], baseConfig)).toThrow('Number')
    expect(() => buildRequestUrl(baseConfig.url, [row('enabled', 'yes', true, 'boolean')], baseConfig)).toThrow('true 或 false')
    expect(() => buildRequestUrl(baseConfig.url, [row('filter', '{bad', true, 'json')], baseConfig)).toThrow('JSON')
  })

  it('builds bearer auth and typed request bodies', () => {
    const headers = buildRequestHeaders({ ...baseConfig, authType: 'bearer', authToken: 'secret' })
    expect(headers.get('Authorization')).toBe('Bearer secret')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(buildRequestBody(baseConfig)).toBe('{"hello":"world"}')
    expect(() => buildRequestBody({ ...baseConfig, bodyText: '{broken' })).toThrow('JSON Body')
  })

  it('formats JSON responses and keeps non-JSON text unchanged', () => {
    expect(formatResponseBody('{"ok":true}', 'application/json')).toContain('\n  "ok": true\n')
    expect(formatResponseBody('{"requestId":9223372036854775807}', 'application/json')).toContain('9223372036854775807')
    expect(formatResponseBody('plain text', 'text/plain')).toBe('plain text')
  })

  it('records status, response headers, size, and timing', async () => {
    const fetcher = vi.fn(async () => new Response('{"ok":true}', { status: 201, statusText: 'Created', headers: { 'Content-Type': 'application/json', 'X-Trace': 'abc' } })) as unknown as typeof fetch
    const result = await executeApiRequest(baseConfig, new AbortController().signal, fetcher)
    expect(result.status).toBe(201)
    expect(result.formattedBody).toContain('"ok": true')
    expect(result.headers.some(({ key }) => key === 'x-trace')).toBe(true)
    expect(result.sizeBytes).toBe(11)
    expect(result.totalMs).toBeGreaterThanOrEqual(0)
    expect(result.request.url).toBe('https://example.com/items?existing=yes&page=2')
    expect(generateRequestCode(result.request, 'curl')).toContain("--header 'content-type: application/json'")
    expect(generateRequestCode(result.request, 'javascript')).toContain('await fetch')
    expect(generateRequestCode(result.request, 'python')).toContain('requests.request')
    expect(generateRequestCode(result.request, 'powershell')).toContain('Invoke-WebRequest')
    expect(generateRequestCode(result.request, 'http')).toContain('POST /items?existing=yes&page=2 HTTP/1.1')
  })
})
