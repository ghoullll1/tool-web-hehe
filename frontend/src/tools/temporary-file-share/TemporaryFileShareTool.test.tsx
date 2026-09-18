// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolDescriptor } from '../../types/tool'
import TemporaryFileShareTool from './TemporaryFileShareTool'
import { createTemporaryShare, downloadTemporaryShare } from './temporaryFileShareApi'

vi.mock('./temporaryFileShareApi', () => ({
  createTemporaryShare: vi.fn(),
  downloadTemporaryShare: vi.fn(),
}))

const tool: ToolDescriptor = {
  slug: 'temporary-file-share',
  displayName: '文件临时分享',
  description: 'test',
  categoryCode: 'other',
  iconKey: 'share',
  routePath: '/tools/temporary-file-share',
  executionMode: 'HYBRID',
  frontendKey: 'utilities.temporary.file.share.v1',
}

beforeEach(() => {
  window.history.replaceState(null, '', '/tools/temporary-file-share')
  vi.mocked(createTemporaryShare).mockReset()
  vi.mocked(downloadTemporaryShare).mockReset()
})

afterEach(() => cleanup())

describe('TemporaryFileShareTool', () => {
  it('presents fixed non-editable policy and rejects empty files', () => {
    const { container } = render(<TemporaryFileShareTool tool={tool} />)

    expect(screen.getByRole('img', { name: '临时文件保险库：5 分钟有效，最多下载 1 次，使用 256 bit 随机密钥' })).toBeTruthy()
    expect(screen.getByText('5:00')).toBeTruthy()
    expect(screen.getByText('1×')).toBeTruthy()
    expect(screen.getByText('单个文件最大 30 MB')).toBeTruthy()
    expect(screen.queryByRole('spinbutton')).toBeNull()
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File([], 'empty.txt')] } })
    expect(screen.getByRole('alert').textContent).toContain('空文件无法分享')
  })

  it('keeps generated credentials masked until each visibility control is toggled', async () => {
    vi.mocked(createTemporaryShare).mockResolvedValue({
      shareId: '40f68803-28ec-47a3-a986-7d874dd82f04',
      accessKey: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO12',
      originalFilename: 'report.txt',
      sizeBytes: 5,
      sha256: 'hash-value',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      serverTime: new Date().toISOString(),
      maxDownloads: 1,
    })
    const { container } = render(<TemporaryFileShareTool tool={tool} />)
    const file = new File(['hello'], 'report.txt', { type: 'text/plain' })
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: /创建临时分享/ }))

    await waitFor(() => expect(screen.getByText('一次性分享链接')).toBeTruthy())
    expect(createTemporaryShare).toHaveBeenCalledWith(file, expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(screen.getByText('分享 ID')).toBeTruthy()
    expect(screen.getByText('40f68803-28ec-47a3-a986-7d874dd82f04')).toBeTruthy()
    expect(screen.getByRole('button', { name: '复制 ID' })).toBeTruthy()
    expect(screen.getByText(/abcdefg.*••••.*MNO12/)).toBeTruthy()
    expect(container.textContent).not.toContain('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO12')

    const visibilityButton = screen.getByRole('button', { name: '显示访问密钥' })
    fireEvent.click(visibilityButton)
    expect(screen.getByText('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO12')).toBeTruthy()
    expect(screen.getByRole('button', { name: '隐藏访问密钥' }).getAttribute('aria-pressed')).toBe('true')
    const revealedValue = screen.getByLabelText('访问密钥完整内容，可左右拖动查看')
    Object.defineProperties(revealedValue, {
      scrollLeft: { value: 0, writable: true },
      setPointerCapture: { value: vi.fn() },
      hasPointerCapture: { value: vi.fn(() => true) },
      releasePointerCapture: { value: vi.fn() },
    })
    fireEvent.pointerDown(revealedValue, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 120 })
    fireEvent.pointerMove(revealedValue, { pointerId: 1, pointerType: 'mouse', clientX: 70 })
    expect(revealedValue.scrollLeft).toBe(50)
    fireEvent.pointerUp(revealedValue, { pointerId: 1, pointerType: 'mouse' })

    fireEvent.click(screen.getByRole('button', { name: '隐藏访问密钥' }))
    expect(container.textContent).not.toContain('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO12')
    expect(screen.getByRole('button', { name: '显示访问密钥' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('opens recipient mode from credentials in the URL fragment', () => {
    window.history.replaceState(null, '', '/tools/temporary-file-share#share=share-id&key=secret-key')

    render(<TemporaryFileShareTool tool={tool} />)

    expect(screen.getByRole('tab', { name: /接收文件/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByDisplayValue('share-id')).toBeTruthy()
    expect(screen.getByDisplayValue('secret-key')).toBeTruthy()
    expect(screen.getByRole('img', { name: '访问凭证到一次性文件：等待验证' })).toBeTruthy()
  })

  it('shows determinate progress while receiving a file', () => {
    window.history.replaceState(null, '', '/tools/temporary-file-share#share=share-id&key=secret-key')
    vi.mocked(downloadTemporaryShare).mockImplementation((_shareId, _accessKey, options) => {
      options?.onProgress?.({ loadedBytes: 5, totalBytes: 10, percentage: 50 })
      return new Promise(() => undefined)
    })

    render(<TemporaryFileShareTool tool={tool} />)
    fireEvent.click(screen.getByRole('button', { name: /验证密钥并下载/ }))

    expect(downloadTemporaryShare).toHaveBeenCalledWith('share-id', 'secret-key', expect.objectContaining({
      signal: expect.any(AbortSignal),
      onProgress: expect.any(Function),
    }))
    expect(screen.getByText('50%')).toBeTruthy()
    expect(screen.getByText('5 B / 10 B')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: '文件接收进度' }).getAttribute('aria-valuenow')).toBe('50')
    expect(screen.getByRole('img', { name: '访问凭证到一次性文件：正在验证' })).toBeTruthy()
  })
})
