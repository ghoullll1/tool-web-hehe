// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolDescriptor } from '../../types/tool'
import TemporaryChatTool from './TemporaryChatTool'
import { createChatSession, joinChatSession } from './temporaryChatApi'
import { AppearanceProvider } from '../../appearance/AppearanceProvider'
import { AppearanceSwitch } from '../../appearance/AppearanceSwitch'

vi.mock('./temporaryChatApi', async (loadOriginal) => {
  const original = await loadOriginal<typeof import('./temporaryChatApi')>()
  return { ...original, createChatSession: vi.fn(), joinChatSession: vi.fn() }
})

const tool: ToolDescriptor = {
  slug: 'temporary-chat', displayName: '临时会话', description: 'test', categoryCode: 'other',
  iconKey: 'chat', routePath: '/tools/temporary-chat', executionMode: 'HYBRID',
  frontendKey: 'utilities.temporary.chat.v1',
}

class FakeWebSocket {
  static readonly OPEN = 1
  static instances: FakeWebSocket[] = []
  readonly sent: string[] = []
  readyState = 0
  private listeners = new Map<string, Array<(event: { data?: string }) => void>>()

  constructor(readonly url: string) { FakeWebSocket.instances.push(this) }
  addEventListener(type: string, listener: (event: { data?: string }) => void) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }
  send(value: string) { this.sent.push(value) }
  close() { this.readyState = 3 }
  emit(type: string, data?: string) {
    if (type === 'open') this.readyState = FakeWebSocket.OPEN
    this.listeners.get(type)?.forEach((listener) => listener({ data }))
  }
}

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/tools/temporary-chat')
  FakeWebSocket.instances = []
  vi.stubGlobal('WebSocket', FakeWebSocket)
  vi.mocked(createChatSession).mockReset()
  vi.mocked(joinChatSession).mockReset()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('TemporaryChatTool', () => {
  it('opens recipient mode when an invitation key is present in the fragment', () => {
    window.history.replaceState(null, '', '/tools/temporary-chat#key=ABCD-EFGH-JKMN')
    render(<TemporaryChatTool tool={tool} />)

    expect(screen.getByRole('tab', { name: '使用密钥加入' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByDisplayValue('ABCD-EFGH-JKMN')).toBeTruthy()
    expect(screen.getByPlaceholderText('例如：呵呵')).toBeTruthy()
    expect(screen.getByRole('tab', { name: '使用密钥加入' }).querySelector('svg')).toBeTruthy()
    expect(screen.getByRole('img', { name: '两位用户通过一次性密钥建立会话' }).querySelector('svg')).toBeTruthy()
  })

  it('formats and validates an invitation key before allowing a join', async () => {
    vi.mocked(joinChatSession).mockResolvedValue({
      sessionId: '4fdbd8af-b85a-48c8-a783-18387712b61c',
      participantTicket: 'participant-ticket',
      expiresAt: new Date(Date.now() + 180_000).toISOString(),
      serverTime: new Date().toISOString(),
      websocketPath: '/ws/v1/temporary-chat',
    })
    render(<TemporaryChatTool tool={tool} />)

    fireEvent.click(screen.getByRole('tab', { name: '使用密钥加入' }))
    const submit = screen.getByRole('button', { name: /验证并加入/ }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)

    fireEvent.change(screen.getByRole('textbox', { name: /会话密钥/ }), {
      target: { value: 'abcd efgh jkmn' },
    })

    expect(screen.getByDisplayValue('ABCD-EFGH-JKMN')).toBeTruthy()
    expect(submit.disabled).toBe(false)

    fireEvent.click(submit)
    await waitFor(() => expect(joinChatSession).toHaveBeenCalledWith('ABCD-EFGH-JKMN', '', expect.anything()))
  })

  it('authenticates once and retains the live connection across edition changes', async () => {
    vi.mocked(createChatSession).mockResolvedValue({
      sessionId: '4fdbd8af-b85a-48c8-a783-18387712b61c',
      sessionKey: 'ABCD-EFGH-JKMN',
      creatorTicket: 'secret-ticket',
      expiresAt: new Date(Date.now() + 180_000).toISOString(),
      serverTime: new Date().toISOString(),
      websocketPath: '/ws/v1/temporary-chat',
    })
    render(<AppearanceProvider><AppearanceSwitch /><TemporaryChatTool tool={tool} /></AppearanceProvider>)
    fireEvent.click(screen.getByRole('button', { name: /生成会话密钥/ }))

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
    const socket = FakeWebSocket.instances[0]!
    expect(socket.url).toContain('/ws/v1/temporary-chat')
    socket.emit('open')
    expect(JSON.parse(socket.sent[0]!)).toMatchObject({ type: 'AUTH', data: { ticket: 'secret-ticket' } })

    socket.emit('message', JSON.stringify({
      messageId: crypto.randomUUID(), type: 'AUTHENTICATED', timestamp: new Date().toISOString(),
      data: { role: 'CREATOR' },
    }))
    socket.emit('message', JSON.stringify({
      messageId: crypto.randomUUID(), type: 'WAITING_FOR_PEER', timestamp: new Date().toISOString(), data: {},
    }))

    expect(await screen.findByText('ABCD-EFGH-JKMN')).toBeTruthy()
    expect(screen.getByRole('button', { name: '复制邀请链接' })).toBeTruthy()
    expect(document.body.textContent).not.toContain('secret-ticket')
    fireEvent.click(screen.getByRole('button', { name: '经典版' }))
    fireEvent.click(screen.getByRole('button', { name: '现代版' }))
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(socket.readyState).toBe(FakeWebSocket.OPEN)
    expect(createChatSession).toHaveBeenCalledTimes(1)
    expect(screen.getByText('ABCD-EFGH-JKMN')).toBeTruthy()
  })

  it('shows a dedicated closed state instead of an empty chat canvas', async () => {
    vi.mocked(createChatSession).mockResolvedValue({
      sessionId: '4fdbd8af-b85a-48c8-a783-18387712b61c',
      sessionKey: 'ABCD-EFGH-JKMN',
      creatorTicket: 'secret-ticket',
      expiresAt: new Date(Date.now() + 180_000).toISOString(),
      serverTime: new Date().toISOString(),
      websocketPath: '/ws/v1/temporary-chat',
    })
    render(<TemporaryChatTool tool={tool} />)
    fireEvent.click(screen.getByRole('button', { name: /生成会话密钥/ }))

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
    FakeWebSocket.instances[0]!.emit('close')

    expect(await screen.findByRole('heading', { name: '这段临时会话已经结束' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /重新建立会话/ })).toBeTruthy()
  })
})
