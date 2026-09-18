// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ToolDescriptor } from '../../types/tool'
import DocumentConverterTool from './DocumentConverterTool'

const api = vi.hoisted(() => ({ convertDocument: vi.fn() }))
vi.mock('./documentConversionApi', () => ({ convertDocument: api.convertDocument }))

const tool: ToolDescriptor = {
  slug: 'document-converter',
  displayName: '文档转 Markdown',
  description: '转换文档',
  categoryCode: 'pdf',
  iconKey: 'document',
  routePath: '/tools/document-converter',
  executionMode: 'HYBRID',
  frontendKey: 'document.convert.markdown.v1',
}

afterEach(() => {
  cleanup()
  api.convertDocument.mockReset()
})

describe('DocumentConverterTool', () => {
  it('moves from file selection through conversion to a Markdown result', async () => {
    api.convertDocument.mockImplementation(async (_file, options) => {
      options.onUploadProgress?.(100)
      options.onUploadComplete?.()
      return {
        schemaVersion: '1.0', requestId: 'request-1', title: 'Release notes', markdown: '# Release notes',
        source: { filename: 'release.docx', extension: '.docx', contentType: 'application/octet-stream', sizeBytes: 7 },
        engine: 'markitdown', engineVersion: '1.0', metrics: { durationMs: 42, markdownCharacters: 15 }, warnings: [],
      }
    })
    render(<DocumentConverterTool tool={tool} />)

    fireEvent.change(screen.getByLabelText('选择待转换文档'), {
      target: { files: [new File(['content'], 'release.docx')] },
    })
    fireEvent.click(screen.getByRole('button', { name: '开始转换' }))

    expect(await screen.findByRole('heading', { name: 'Release notes' })).toBeTruthy()
    expect(screen.getByLabelText('Markdown 预览')).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: '转换后的 Markdown' })).toBeNull()
    expect(screen.getByText('Markdown 已交付')).toBeTruthy()
    expect(screen.getByText('42 ms')).toBeTruthy()
    expect(api.convertDocument).toHaveBeenCalledTimes(1)
  })

  it('rejects an oversized document before exposing the start action', async () => {
    const oversized = new File(['content'], 'large.pdf')
    Object.defineProperty(oversized, 'size', { value: 10 * 1024 * 1024 + 1 })
    render(<DocumentConverterTool tool={tool} />)

    fireEvent.change(screen.getByLabelText('选择待转换文档'), { target: { files: [oversized] } })

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('10 MB'))
    expect(screen.getByRole('button', { name: /开始转换/ })).toHaveProperty('disabled', true)
    expect(api.convertDocument).not.toHaveBeenCalled()
  })

  it('shows a bounded document-to-Markdown guide before a file is converted', () => {
    render(<DocumentConverterTool tool={tool} />)

    const guide = screen.getByRole('img', { name: '文档转换为 Markdown 的等待动画' })
    expect(guide.textContent).toContain('原始文档')
    expect(guide.textContent).toContain('转换结果')
    expect(guide.textContent).toContain('等待文档进入转换通道')
  })

  it('aborts an in-flight conversion when the tool is unmounted', async () => {
    let signal: AbortSignal | undefined
    api.convertDocument.mockImplementation((_file, options) => {
      signal = options.signal
      return new Promise(() => undefined)
    })
    const view = render(<DocumentConverterTool tool={tool} />)

    fireEvent.change(screen.getByLabelText('选择待转换文档'), {
      target: { files: [new File(['content'], 'release.docx')] },
    })
    fireEvent.click(screen.getByRole('button', { name: '开始转换' }))
    await waitFor(() => expect(api.convertDocument).toHaveBeenCalledTimes(1))

    view.unmount()

    expect(signal?.aborted).toBe(true)
  })
})
