// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { recordToolUsage } from './toolCatalog'

describe('recordToolUsage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts one best-effort usage increment with keepalive enabled', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    await recordToolUsage('json formatter/测试')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/tools/json%20formatter%2F%E6%B5%8B%E8%AF%95/usage',
      { method: 'POST', keepalive: true },
    )
  })

  it('swallows network failures so navigation is never rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))

    await expect(recordToolUsage('hash')).resolves.toBeUndefined()
  })
})
