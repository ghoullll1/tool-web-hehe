// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolDescriptor } from '../../types/tool'
import DnsDiagnosticsTool from './DnsDiagnosticsTool'

const browserDns = vi.hoisted(() => ({ queryDnsInBrowser: vi.fn() }))
vi.mock('./dnsBrowserResolver', () => ({ queryDnsInBrowser: browserDns.queryDnsInBrowser }))

const tool: ToolDescriptor = {
  slug: 'dns-query', displayName: 'DNS 查询', description: '多解析器 DNS 查询',
  categoryCode: 'developer', iconKey: 'network', routePath: '/tools/dns-query',
  executionMode: 'CLIENT', frontendKey: 'developer.dns.diagnostics.v1',
}

const result = {
  requestedDomain: 'example.com', asciiDomain: 'example.com', recordTypes: ['A', 'CNAME'],
  resolvers: [
    {
      id: 'cloudflare', name: 'Cloudflare', vantagePoint: '全球 Anycast', status: 'SUCCESS',
      durationMs: 42, successfulQueries: 2, queryCount: 2,
      queries: [
        { recordType: 'A', status: 'ANSWER', responseCode: 0, responseCodeName: 'NOERROR', authenticatedData: true, truncated: false, durationMs: 40, records: [{ name: 'edge.example.net', type: 'A', ttl: 240, value: '203.0.113.8' }], error: '' },
        { recordType: 'CNAME', status: 'ANSWER', responseCode: 0, responseCodeName: 'NOERROR', authenticatedData: true, truncated: false, durationMs: 42, records: [{ name: 'example.com', type: 'CNAME', ttl: 240, value: 'edge.example.net' }], error: '' },
      ],
      cnameChain: [{ from: 'example.com', to: 'edge.example.net', ttl: 240 }],
    },
    {
      id: 'google', name: 'Google Public DNS', vantagePoint: '全球 Anycast', status: 'SUCCESS',
      durationMs: 39, successfulQueries: 2, queryCount: 2,
      queries: [
        { recordType: 'A', status: 'ANSWER', responseCode: 0, responseCodeName: 'NOERROR', authenticatedData: true, truncated: false, durationMs: 38, records: [{ name: 'edge.example.net', type: 'A', ttl: 300, value: '203.0.113.8' }], error: '' },
        { recordType: 'CNAME', status: 'ANSWER', responseCode: 0, responseCodeName: 'NOERROR', authenticatedData: true, truncated: false, durationMs: 39, records: [{ name: 'example.com', type: 'CNAME', ttl: 300, value: 'edge.example.net' }], error: '' },
      ],
      cnameChain: [{ from: 'example.com', to: 'edge.example.net', ttl: 300 }],
    },
  ],
  comparisons: [
    { recordType: 'A', state: 'CONSISTENT', respondingResolvers: 2, resolverCount: 2, minTtl: 240, maxTtl: 300, variants: [
      { resolverId: 'cloudflare', resolverName: 'Cloudflare', status: 'ANSWER', values: ['203.0.113.8'], minTtl: 240, maxTtl: 240 },
      { resolverId: 'google', resolverName: 'Google Public DNS', status: 'ANSWER', values: ['203.0.113.8'], minTtl: 300, maxTtl: 300 },
    ], summary: '各公共解析器返回的记录集合一致；TTL 差异单独展示。' },
    { recordType: 'CNAME', state: 'CONSISTENT', respondingResolvers: 2, resolverCount: 2, minTtl: 240, maxTtl: 300, variants: [
      { resolverId: 'cloudflare', resolverName: 'Cloudflare', status: 'ANSWER', values: ['edge.example.net'], minTtl: 240, maxTtl: 240 },
      { resolverId: 'google', resolverName: 'Google Public DNS', status: 'ANSWER', values: ['edge.example.net'], minTtl: 300, maxTtl: 300 },
    ], summary: '各公共解析器返回的记录集合一致；TTL 差异单独展示。' },
  ],
  findings: [
    { level: 'success', title: '公共解析器可用性', detail: '2 / 2 个解析器完成了全部查询。' },
    { level: 'info', title: '解析视角说明', detail: '结果来自多个公共递归 DNS 网络。' },
  ],
  totalDurationMs: 48, inspectedAt: '2026-09-14T04:00:00Z', requestId: 'dns-request-1',
}

beforeEach(() => browserDns.queryDnsInBrowser.mockReset())
afterEach(cleanup)

describe('DnsDiagnosticsTool', () => {
  it('starts with every supported type selected and a clear empty state', () => {
    render(<DnsDiagnosticsTool tool={tool} />)

    expect(screen.getByRole('heading', { name: '从多个公共 DNS 看同一个域名' })).toBeTruthy()
    expect(screen.getByText(/浏览器直接查询/)).toBeTruthy()
    expect(screen.getByText('等待一次 DNS 查询')).toBeTruthy()
    expect(screen.getByText('7 / 7 已选择')).toBeTruthy()
    for (const type of ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'CAA']) {
      expect(screen.getByRole('button', { name: type }).getAttribute('aria-pressed')).toBe('true')
    }
  })

  it('submits the selected record types and renders resolver comparison and chain views', async () => {
    browserDns.queryDnsInBrowser.mockResolvedValue(result)
    render(<DnsDiagnosticsTool tool={tool} />)
    fireEvent.change(screen.getByRole('textbox', { name: '查询域名' }), { target: { value: 'example.com' } })
    for (const type of ['AAAA', 'MX', 'TXT', 'NS', 'CAA']) {
      fireEvent.click(screen.getByRole('button', { name: type }))
    }

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /开始查询/ })) })

    expect(browserDns.queryDnsInBrowser).toHaveBeenCalledWith(
      'example.com', ['A', 'CNAME'], expect.any(AbortSignal),
    )
    expect(await screen.findByText('公共解析器可用性')).toBeTruthy()
    expect(screen.getByText('48 ms')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /记录对比/ }))
    expect(screen.getAllByText('结果一致')).toHaveLength(2)
    expect(screen.getAllByText('203.0.113.8').length).toBeGreaterThan(0)
    expect(screen.getAllByText('AD · DNSSEC')).toHaveLength(4)

    fireEvent.click(screen.getByRole('button', { name: /解析链路/ }))
    expect(screen.getAllByText('edge.example.net').length).toBeGreaterThan(0)
  })

  it('requires a domain and at least one record type before dispatch', () => {
    render(<DnsDiagnosticsTool tool={tool} />)
    fireEvent.click(screen.getByRole('button', { name: /开始查询/ }))
    expect(screen.getByRole('alert').textContent).toContain('请输入需要查询的域名')

    fireEvent.change(screen.getByRole('textbox', { name: '查询域名' }), { target: { value: 'example.com' } })
    for (const type of ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'CAA']) {
      fireEvent.click(screen.getByRole('button', { name: type }))
    }
    fireEvent.click(screen.getByRole('button', { name: /开始查询/ }))
    expect(screen.getByRole('alert').textContent).toContain('至少选择一种')
    expect(browserDns.queryDnsInBrowser).not.toHaveBeenCalled()
  })
})
