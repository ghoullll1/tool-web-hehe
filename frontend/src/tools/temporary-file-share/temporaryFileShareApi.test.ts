import { afterEach, expect, it, vi } from 'vitest'
import { downloadTemporaryShare } from './temporaryFileShareApi'

afterEach(() => vi.unstubAllGlobals())

it('posts only the pickup code in JSON without credentials in the URL', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('hello', {
    headers: { 'Content-Length': '5', 'Content-Disposition': "attachment; filename*=UTF-8''report.txt" },
  }))
  vi.stubGlobal('fetch', fetch)
  const result = await downloadTemporaryShare('01234567')
  expect(fetch).toHaveBeenCalledWith('/api/v1/file-shares/download', expect.objectContaining({
    method: 'POST', body: '{"pickupCode":"01234567"}', cache: 'no-store', credentials: 'omit',
    headers: { Accept: 'application/octet-stream', 'Content-Type': 'application/json' },
  }))
  expect(result.filename).toBe('report.txt')
  expect(await result.blob.text()).toBe('hello')
})

it('reports rate limiting without attempting to read a file', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: '请稍后重试' }), { status: 429 })))
  await expect(downloadTemporaryShare('01234567')).rejects.toThrow('请稍后重试')
})
