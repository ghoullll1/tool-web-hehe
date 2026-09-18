// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryDnsInBrowser } from './dnsBrowserResolver'

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/dns-json' }),
    text: async () => JSON.stringify(payload),
  } as Response
}

afterEach(() => vi.unstubAllGlobals())

describe('browser-local DNS resolver', () => {
  it('queries every fixed resolver directly from the browser and compares normalized answers', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      const ttl = url.hostname === 'dns.google' ? 300 : 240
      const type = url.searchParams.get('type')
      return jsonResponse({
        Status: 0,
        AD: true,
        Answer: type === 'A'
          ? [{ name: 'Example.COM.', type: 1, TTL: ttl, data: '203.0.113.8' }]
          : [{ name: 'Example.COM.', type: 5, TTL: ttl, data: 'Edge.Example.NET.' }],
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await queryDnsInBrowser('Example.COM.', ['A', 'CNAME'], new AbortController().signal)

    expect(fetchMock).toHaveBeenCalledTimes(6)
    for (const call of fetchMock.mock.calls) {
      const url = new URL(String(call[0]))
      expect(['cloudflare-dns.com', 'dns.google', 'dns.alidns.com']).toContain(url.hostname)
      expect(url.searchParams.get('name')).toBe('example.com')
    }
    expect(result.requestedDomain).toBe('Example.COM')
    expect(result.resolvers).toHaveLength(3)
    expect(result.resolvers.every((resolver) => resolver.status === 'SUCCESS')).toBe(true)
    expect(result.resolvers.every((resolver) => resolver.cnameChain[0]?.to === 'edge.example.net')).toBe(true)
    expect(result.comparisons.map((comparison) => comparison.state)).toEqual(['CONSISTENT', 'CONSISTENT'])
    expect(result.comparisons[0]?.minTtl).toBe(240)
    expect(result.comparisons[0]?.maxTtl).toBe(300)
    expect(result.findings.at(-1)?.title).toBe('本地网络视角')
    expect(result.requestId).toMatch(/^local-/)
  })

  it('preserves other resolver results when one browser request is blocked', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.hostname === 'cloudflare-dns.com') throw new TypeError('Failed to fetch')
      return jsonResponse({ Status: 0, Answer: [{ name: 'example.com.', type: 1, TTL: 60, data: '203.0.113.9' }] })
    }))

    const result = await queryDnsInBrowser('example.com', ['A'], new AbortController().signal)

    expect(result.resolvers.find((resolver) => resolver.id === 'cloudflare')?.status).toBe('ERROR')
    expect(result.resolvers.find((resolver) => resolver.id === 'cloudflare')?.queries[0]?.error).toContain('本地网络')
    expect(result.resolvers.filter((resolver) => resolver.status === 'SUCCESS')).toHaveLength(2)
    expect(result.comparisons[0]?.state).toBe('PARTIAL')
  })

  it('rejects an oversized upstream response before buffering its body', async () => {
    const bodyRead = vi.fn(async () => '{}')
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.hostname !== 'cloudflare-dns.com') {
        return jsonResponse({ Status: 0, Answer: [{ name: 'example.com.', type: 1, TTL: 60, data: '203.0.113.9' }] })
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': '300000' }),
        text: bodyRead,
      } as unknown as Response
    }))

    const result = await queryDnsInBrowser('example.com', ['A'], new AbortController().signal)

    expect(result.resolvers[0]?.queries[0]?.error).toBe('响应超过大小限制')
    expect(bodyRead).not.toHaveBeenCalled()
    expect(result.comparisons[0]?.state).toBe('PARTIAL')
  })

  it('rejects URLs and IP addresses before making any network request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(queryDnsInBrowser('https://example.com/path', ['A'], new AbortController().signal))
      .rejects.toThrow('有效域名')
    await expect(queryDnsInBrowser('127.0.0.1', ['A'], new AbortController().signal))
      .rejects.toThrow('有效域名')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('aborts all outstanding browser queries without converting cancellation into provider errors', async () => {
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
    })))
    const controller = new AbortController()
    const pending = queryDnsInBrowser('example.com', ['A'], controller.signal)

    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
