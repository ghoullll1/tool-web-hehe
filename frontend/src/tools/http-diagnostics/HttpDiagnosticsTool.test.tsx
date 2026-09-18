// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolDescriptor } from '../../types/tool'
import HttpDiagnosticsTool from './HttpDiagnosticsTool'

const api = vi.hoisted(() => ({ executeServerTool: vi.fn() }))
vi.mock('../../api/toolCatalog', () => ({ executeServerTool: api.executeServerTool }))

const tool: ToolDescriptor = {
  slug: 'http-response-diagnostics', displayName: 'HTTP 响应诊断', description: '响应诊断',
  categoryCode: 'developer', iconKey: 'network', routePath: '/tools/http-response-diagnostics',
  executionMode: 'HYBRID', frontendKey: 'developer.http.diagnostics.v1',
}

const result = {
  requestedUrl: 'https://example.com', finalUrl: 'https://www.example.com/', method: 'GET', status: 200,
  reasonPhrase: 'OK', protocol: 'HTTP/2', resolvedAddresses: ['93.184.216.34'],
  redirects: [{ sequence: 1, url: 'https://example.com/', status: 301, location: 'https://www.example.com/', resolvedUrl: 'https://www.example.com/', durationMs: 42 }],
  headers: [{ name: 'cache-control', value: 'max-age=600' }, { name: 'content-encoding', value: 'br' }],
  compression: { compressed: true, contentEncoding: 'br', contentType: 'text/html', contentLength: 1200, variesByAcceptEncoding: true, summary: '响应使用了 br 压缩。' },
  cache: { cacheControl: 'max-age=600', browserCacheable: true, sharedCacheable: true, freshnessSeconds: 600, hasValidator: true, validator: 'ETag', summary: '显式新鲜期为 600 秒。' },
  security: {
    score: 85, grade: 'B', heuristic: true, cookieCount: 1, weakCookieCount: 0,
    summary: '这是基于响应头覆盖情况的启发式评分，不等同于漏洞扫描或合规审计。',
    controls: [{ name: '传输加密', status: 'pass', detail: '最终地址使用 HTTPS。' }],
  },
  cors: { configured: true, allowOrigin: 'https://app.example', allowsCredentials: false, allowMethods: 'GET', allowHeaders: '未声明', exposeHeaders: '未声明', permissive: false, summary: '仅允许声明的来源进行跨域读取。' },
  response: { contentType: 'text/html', charset: 'UTF-8', transferEncoding: '未声明', connection: '未声明', server: 'nginx', poweredBy: '未声明', contentDisposition: '未声明', ageSeconds: null, cookieCount: 1, summary: '响应公开了部分服务端实现信息。' },
  authentication: { configured: false, type: 'NONE', sentToFinalOrigin: false, strippedOnRedirect: false, summary: '本次请求未包含用户凭证。' },
  tls: {
    used: true, handshakeCount: 2, totalHandshakeMs: 37,
    summary: '完成 2 次 TLS 握手；最终连接使用 TLSv1.3，证书由 Let\'s Encrypt 签发。',
    handshakes: [
      {
        sequence: 1, url: 'https://example.com/', host: 'example.com', handshakeMs: 16,
        protocol: 'TLSv1.3', cipherSuite: 'TLS_AES_256_GCM_SHA384', issuerOrganization: 'Let\'s Encrypt',
        issuerDistinguishedName: "CN=R13,O=Let's Encrypt,C=US", subjectCommonName: 'example.com',
        subjectDistinguishedName: 'CN=example.com', validFrom: '2026-08-01T00:00:00Z', validUntil: '2026-11-01T00:00:00Z',
        daysRemaining: 48, serialNumber: 'ABC123', signatureAlgorithm: 'SHA256withRSA', certificateChainLength: 2,
      },
      {
        sequence: 2, url: 'https://www.example.com/', host: 'www.example.com', handshakeMs: 21,
        protocol: 'TLSv1.3', cipherSuite: 'TLS_AES_256_GCM_SHA384', issuerOrganization: 'Let\'s Encrypt',
        issuerDistinguishedName: "CN=R13,O=Let's Encrypt,C=US", subjectCommonName: 'www.example.com',
        subjectDistinguishedName: 'CN=www.example.com', validFrom: '2026-08-01T00:00:00Z', validUntil: '2026-11-01T00:00:00Z',
        daysRemaining: 48, serialNumber: 'DEF456', signatureAlgorithm: 'SHA256withRSA', certificateChainLength: 2,
      },
    ],
  },
  timing: { dnsMs: 8, connectionAndHeadersMs: 91, totalMs: 101, redirectCount: 1, note: '包含连接与等待。' },
  findings: [{ level: 'success', title: 'HTTP 200', detail: '目标站点返回了可用响应。' }],
  inspectedAt: '2026-09-14T03:00:00Z', requestId: 'request-1',
}

beforeEach(() => api.executeServerTool.mockReset())
afterEach(cleanup)

describe('HttpDiagnosticsTool', () => {
  it('starts with a readable, empty server-diagnostics composer', () => {
    render(<HttpDiagnosticsTool tool={tool} />)
    expect(screen.getByRole('heading', { name: '配置诊断请求' })).toBeTruthy()
    expect(screen.queryByText(/看见一次 HTTP 响应/)).toBeNull()
    expect(screen.getByRole('textbox', { name: '目标 URL' })).toHaveProperty('value', '')
    expect(screen.getByText('等待一次真实的响应')).toBeTruthy()
    const advanced = screen.getByRole('button', { name: '高级设置' })
    expect(advanced.querySelector('.hd-chevron')).toBeTruthy()
    expect(advanced.textContent).not.toContain('⌄')
  })

  it('submits bounded metadata-only settings and renders diagnostics', async () => {
    api.executeServerTool.mockResolvedValue(result)
    render(<HttpDiagnosticsTool tool={tool} />)
    fireEvent.change(screen.getByRole('textbox', { name: '目标 URL' }), { target: { value: 'https://example.com' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /开始诊断/ })) })

    await screen.findByText('101 ms')
    expect(api.executeServerTool).toHaveBeenCalledWith(tool.slug, expect.objectContaining({
      url: 'https://example.com', method: 'GET', followRedirects: true, timeoutMs: 12000, maxRedirects: 6,
    }), expect.any(AbortSignal))
    expect(screen.getByText('HTTP 200')).toBeTruthy()
    expect(screen.getByText('SECURITY HEADERS')).toBeTruthy()
    expect(screen.getByText('安全响应头检查')).toBeTruthy()
  })

  it('preserves controlled credentials for repeated diagnostics without exposing them in rendered results', async () => {
    api.executeServerTool.mockResolvedValue({
      ...result,
      authentication: { configured: true, type: 'BEARER', sentToFinalOrigin: true, strippedOnRedirect: false, summary: '凭证仅发送给原始来源。' },
    })
    render(<HttpDiagnosticsTool tool={tool} />)
    fireEvent.click(screen.getByRole('button', { name: /高级设置/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Bearer' }))
    fireEvent.change(screen.getByRole('textbox', { name: '目标 URL' }), { target: { value: 'https://example.com' } })
    fireEvent.change(screen.getByLabelText('认证凭证'), { target: { value: 'private-token' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /开始诊断/ })) })

    expect(api.executeServerTool).toHaveBeenCalledWith(tool.slug, expect.objectContaining({
      authentication: { type: 'BEARER', username: null, secret: 'private-token', headerName: null },
    }), expect.any(AbortSignal))
    expect(screen.getByLabelText('认证凭证')).toHaveProperty('value', 'private-token')
    expect(document.body.textContent).not.toContain('private-token')
    expect(screen.getByText('BEARER 已配置')).toBeTruthy()
  })

  it('keeps credential selection independent from the redirect switch', () => {
    render(<HttpDiagnosticsTool tool={tool} />)
    fireEvent.click(screen.getByRole('button', { name: /高级设置/ }))
    const redirectSwitch = screen.getByRole('switch', { name: '自动跟随重定向' })

    expect(redirectSwitch.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Basic' }))
    expect(screen.getByRole('button', { name: 'Basic' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByLabelText('认证用户名')).toBeTruthy()
    expect(redirectSwitch.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Bearer' }))
    expect(screen.getByRole('button', { name: 'Bearer' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByLabelText('认证用户名')).toBeNull()
    expect(redirectSwitch.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'API Key' }))
    expect(screen.getByRole('button', { name: 'API Key' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByLabelText('API Key 请求头名称')).toBeTruthy()
    expect(redirectSwitch.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(redirectSwitch)
    expect(redirectSwitch.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('button', { name: 'API Key' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('normalizes fragments and redirects embedded credentials to the safe controls', async () => {
    api.executeServerTool.mockResolvedValue(result)
    render(<HttpDiagnosticsTool tool={tool} />)
    const urlInput = screen.getByRole('textbox', { name: '目标 URL' })

    fireEvent.change(urlInput, { target: { value: 'https://service.example.com/#/login' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /开始诊断/ })) })
    expect(api.executeServerTool).toHaveBeenCalledWith(tool.slug, expect.objectContaining({
      url: 'https://service.example.com/',
    }), expect.any(AbortSignal))
    expect(urlInput).toHaveProperty('value', 'https://service.example.com/')
    expect(screen.getByRole('status').textContent).toContain('已忽略 # 后的浏览器片段')

    api.executeServerTool.mockClear()
    fireEvent.change(urlInput, { target: { value: 'https://alice:secret@example.com/private' } })
    fireEvent.click(screen.getByRole('button', { name: /开始诊断/ }))
    expect(api.executeServerTool).not.toHaveBeenCalled()
    expect(urlInput).toHaveProperty('value', 'https://example.com/private')
    expect(screen.getByRole('alert').textContent).toContain('高级设置的凭证区域')
    expect(screen.getByRole('button', { name: /高级设置/ }).getAttribute('aria-expanded')).toBe('true')
  })

  it('switches result tabs and filters response headers', async () => {
    api.executeServerTool.mockResolvedValue(result)
    render(<HttpDiagnosticsTool tool={tool} />)
    fireEvent.change(screen.getByRole('textbox', { name: '目标 URL' }), { target: { value: 'https://example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /开始诊断/ }))
    await screen.findByText('HTTP 200')
    fireEvent.click(screen.getByRole('button', { name: /响应头/ }))
    fireEvent.change(screen.getByPlaceholderText('搜索响应头名称、内容或作用'), { target: { value: 'encoding' } })
    expect(screen.getByText('content-encoding')).toBeTruthy()
    expect(screen.getByText(/压缩编码/)).toBeTruthy()
    expect(screen.queryByText('cache-control')).toBeNull()
  })

  it('shows actual TLS issuer, certificate validity and handshake measurements', async () => {
    api.executeServerTool.mockResolvedValue(result)
    render(<HttpDiagnosticsTool tool={tool} />)
    fireEvent.change(screen.getByRole('textbox', { name: '目标 URL' }), { target: { value: 'https://example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /开始诊断/ }))
    await screen.findByText('HTTP 200')
    expect(screen.getByText('37 ms')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /TLS \/ 证书/ }))
    expect(screen.getByRole('heading', { name: 'HTTPS 握手与证书链' })).toBeTruthy()
    expect(screen.getAllByText("Let's Encrypt")).toHaveLength(2)
    expect(screen.getAllByText('www.example.com').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('TLS_AES_256_GCM_SHA384')).toHaveLength(2)
    expect(screen.getAllByText(/剩余 48 天/)).toHaveLength(2)
  })

  it('presents timing as additive main phases with TLS nested inside the request phase', async () => {
    api.executeServerTool.mockResolvedValue(result)
    render(<HttpDiagnosticsTool tool={tool} />)
    fireEvent.change(screen.getByRole('textbox', { name: '目标 URL' }), { target: { value: 'https://example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /开始诊断/ }))
    await screen.findByText('HTTP 200')
    fireEvent.click(screen.getByRole('button', { name: /连接耗时/ }))

    expect(screen.getByRole('heading', { name: '请求阶段分解' })).toBeTruthy()
    expect(screen.getByText('互斥阶段 · 不重复计时')).toBeTruthy()
    expect(screen.getByText('其中 TLS 握手 37 ms')).toBeTruthy()
    expect(screen.getByLabelText('其余连接与等待 54 毫秒')).toBeTruthy()
    expect(screen.getByLabelText('结果分析 2 毫秒')).toBeTruthy()
    expect(screen.getByLabelText('连接与响应头子阶段')).toBeTruthy()
    expect(screen.getByText(/相加等于完整流程/)).toBeTruthy()
  })

  it('keeps plain HTTP timing readable without rendering a TLS substage', async () => {
    api.executeServerTool.mockResolvedValue({
      ...result,
      tls: { used: false, handshakeCount: 0, totalHandshakeMs: 0, handshakes: [], summary: '本次请求未使用 TLS。' },
      timing: { ...result.timing, dnsMs: 5, connectionAndHeadersMs: 37, totalMs: 45 },
    })
    render(<HttpDiagnosticsTool tool={tool} />)
    fireEvent.change(screen.getByRole('textbox', { name: '目标 URL' }), { target: { value: 'http://example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /开始诊断/ }))
    await screen.findByText('HTTP 200')
    fireEvent.click(screen.getByRole('button', { name: /连接耗时/ }))

    expect(screen.getByText('TCP 建连、服务端处理与首个响应头')).toBeTruthy()
    expect(screen.getByLabelText('结果分析 3 毫秒')).toBeTruthy()
    expect(screen.queryByLabelText('连接与响应头子阶段')).toBeNull()
  })

  it('validates an empty URL and rejects malformed server output', async () => {
    render(<HttpDiagnosticsTool tool={tool} />)
    fireEvent.click(screen.getByRole('button', { name: /开始诊断/ }))
    expect(screen.getByRole('alert').textContent).toContain('请输入')

    api.executeServerTool.mockResolvedValue({ status: 200 })
    fireEvent.change(screen.getByRole('textbox', { name: '目标 URL' }), { target: { value: 'http://127.0.0.1' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /开始诊断/ })) })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('无法识别'))

    api.executeServerTool.mockResolvedValue({ ...result, tls: { ...result.tls, handshakeCount: 99 } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /开始诊断/ })) })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('无法识别'))
  })
})
