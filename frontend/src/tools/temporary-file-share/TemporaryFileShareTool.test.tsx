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
  it('opens the file picker from the empty dropzone and accepts a dropped file without uploading', () => {
    const { container } = render(<TemporaryFileShareTool tool={tool} />)
    const input = screen.getByLabelText('选择分享文件')
    const openPicker = vi.spyOn(input, 'click').mockImplementation(() => undefined)
    fireEvent.click(screen.getByRole('button', { name: /拖入文件，或点击选择/ }))
    expect(openPicker).toHaveBeenCalledTimes(1)
    const zone = container.querySelector('.temporary-dropzone')!
    fireEvent.dragEnter(zone)
    expect(zone.classList.contains('is-dragging')).toBe(true)
    fireEvent.drop(zone, { dataTransfer: { files: { item: () => new File(['hello'], 'report.txt') } } })
    expect(zone.classList.contains('is-dragging')).toBe(false)
    expect(zone.classList.contains('has-file')).toBe(true)
    expect(screen.getByRole('button', { name: '更换文件' })).toBeTruthy()
    expect(createTemporaryShare).not.toHaveBeenCalled()
    openPicker.mockRestore()
  })

  it('presents fixed non-editable policy and rejects empty files', () => {
    const { container } = render(<TemporaryFileShareTool tool={tool} />)

    expect(screen.getByRole('img', { name: '临时文件保险库：5 分钟有效，最多下载 1 次，使用 8 位取件码' })).toBeTruthy()
    expect(screen.getByText('5:00')).toBeTruthy()
    expect(screen.getByText('1×')).toBeTruthy()
    expect(screen.getByText('单个文件最大 30 MB')).toBeTruthy()
    expect(screen.queryByRole('spinbutton')).toBeNull()
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File([], 'empty.txt')] } })
    expect(screen.getByRole('alert').textContent).toContain('空文件无法分享')
  })

  it('shows the same eight-digit code in the link and locally generated QR', async () => {
    vi.mocked(createTemporaryShare).mockResolvedValue({
      pickupCode: '01234567', originalFilename: 'report.txt', sizeBytes: 5, sha256: 'hash-value',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      serverTime: new Date().toISOString(), maxDownloads: 1,
    })
    const { container } = render(<TemporaryFileShareTool tool={tool} />)
    const file = new File(['hello'], 'report.txt', { type: 'text/plain' })
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: /创建临时分享/ }))
    await waitFor(() => expect(screen.getByLabelText('取件码 01234567')).toBeTruthy())
    expect(screen.getByLabelText('取件码 01234567').textContent).toBe('0123 4567')
    expect((screen.getByRole('textbox', { name: '分享链接' }) as HTMLInputElement).value).toContain('#code=01234567')
    expect(screen.getByRole('img', { name: '扫描二维码接收文件' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '复制取件码' })).toBeTruthy()
    expect(screen.queryByText('分享 ID')).toBeNull()
    expect(screen.queryByText('访问密钥')).toBeNull()
    expect(downloadTemporaryShare).not.toHaveBeenCalled()
  })

  it('opens recipient mode from credentials in the URL fragment', () => {
    window.history.replaceState(null, '', '/tools/temporary-file-share#code=01234567')

    render(<TemporaryFileShareTool tool={tool} />)

    expect(screen.getByRole('tab', { name: /接收文件/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByDisplayValue('01234567')).toBeTruthy()
    expect(window.location.hash).toBe('')
    expect(downloadTemporaryShare).not.toHaveBeenCalled()
    expect(screen.getByRole('img', { name: '访问凭证到一次性文件：等待验证' })).toBeTruthy()
  })

  it('shows determinate progress while receiving a file', () => {
    window.history.replaceState(null, '', '/tools/temporary-file-share#code=01234567')
    vi.mocked(downloadTemporaryShare).mockImplementation((_code, options) => {
      options?.onProgress?.({ loadedBytes: 5, totalBytes: 10, percentage: 50 })
      return new Promise(() => undefined)
    })

    render(<TemporaryFileShareTool tool={tool} />)
    fireEvent.click(screen.getByRole('button', { name: /取件并下载/ }))

    expect(downloadTemporaryShare).toHaveBeenCalledWith('01234567', expect.objectContaining({
      signal: expect.any(AbortSignal),
      onProgress: expect.any(Function),
    }))
    expect(screen.getByText('50%')).toBeTruthy()
    expect(screen.getByText('5 B / 10 B')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: '文件接收进度' }).getAttribute('aria-valuenow')).toBe('50')
    expect(screen.getByRole('img', { name: '访问凭证到一次性文件：正在验证' })).toBeTruthy()
  })

  it('normalizes pasted digits and does not allow an incomplete code', () => {
    render(<TemporaryFileShareTool tool={tool} />)
    fireEvent.click(screen.getByRole('tab', { name: /接收文件/ }))
    const input = screen.getByRole('textbox', { name: '8 位取件码' })
    const submit = screen.getByRole('button', { name: /取件并下载/ }) as HTMLButtonElement
    fireEvent.change(input, { target: { value: '1234' } })
    expect(submit.disabled).toBe(true)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(downloadTemporaryShare).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '０１２３-４５６７' } })
    expect((input as HTMLInputElement).value).toBe('01234567')
    expect(submit.disabled).toBe(false)
  })

  it('removes the QR and disables sharing controls for an expired code', async () => {
    vi.mocked(createTemporaryShare).mockResolvedValue({
      pickupCode: '01234567', originalFilename: 'report.txt', sizeBytes: 5, sha256: 'hash',
      expiresAt: new Date(Date.now() - 1000).toISOString(), serverTime: new Date().toISOString(), maxDownloads: 1,
    })
    render(<TemporaryFileShareTool tool={tool} />)
    fireEvent.change(screen.getByLabelText('选择分享文件'), { target: { files: [new File(['hello'], 'report.txt')] } })
    fireEvent.click(screen.getByRole('button', { name: /创建临时分享/ }))
    await waitFor(() => expect(screen.getByText('二维码已过期')).toBeTruthy())
    expect(screen.queryByRole('img', { name: '扫描二维码接收文件' })).toBeNull()
    expect((screen.getByRole('button', { name: '复制取件码' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '复制链接' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
