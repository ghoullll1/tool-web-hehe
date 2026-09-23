// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChatSession, joinChatSession, temporaryChatWebSocketUrl } from './temporaryChatApi'

afterEach(() => vi.unstubAllGlobals())

describe('temporary chat API', () => {
  it('creates and joins sessions without placing credentials in the URL', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: 'one' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: 'one' }) })
    vi.stubGlobal('fetch', fetchMock)

    await createChatSession('呵呵')
    await joinChatSession('ABCD-EFGH-JKMN', '小周')

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/temporary-chat/sessions')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/temporary-chat/sessions/join')
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toEqual({
      sessionKey: 'ABCD-EFGH-JKMN',
      displayName: '小周',
    })
  })

  it('builds a same-origin WebSocket endpoint', () => {
    window.history.replaceState(null, '', '/tools/temporary-chat')
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    expect(temporaryChatWebSocketUrl('/ws/v1/temporary-chat'))
      .toBe(`${protocol}//${window.location.host}/ws/v1/temporary-chat`)
  })
})
