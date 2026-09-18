// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolDescriptor } from '../../types/tool'
import PdfMergeTool from './PdfMergeTool'

const mocks = vi.hoisted(() => ({ inspect: vi.fn(), merge: vi.fn() }))
vi.mock('./pdfMergeModel', async (loadActual) => {
  const actual = await loadActual<typeof import('./pdfMergeModel')>()
  return { ...actual, inspectPdfFiles: mocks.inspect, mergePdfFiles: mocks.merge }
})

const tool: ToolDescriptor = { slug: 'pdf-merge', displayName: 'PDF 合并', description: 'test', categoryCode: 'pdf', iconKey: 'pdf', routePath: '/tools/pdf-merge', executionMode: 'CLIENT', frontendKey: 'pdf.merge.v1' }

beforeEach(() => {
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:merged'), revokeObjectURL: vi.fn() })
  mocks.inspect.mockImplementation(async (files: File[]) => files.map((file, index) => ({ id: `${file.name}-${index}`, file, name: file.name, size: file.size, pageCount: index + 2, pageSelection: `1-${index + 2}`, pageIndices: Array.from({ length: index + 2 }, (_, page) => page), selectionError: null })))
  mocks.merge.mockImplementation(async (_items, onProgress) => { onProgress({ completedFiles: 2, totalFiles: 2, progress: 1 }); return new Uint8Array([1, 2, 3]) })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('PdfMergeTool', () => {
  it('adds files, exposes ordering controls, and removes an item', async () => {
    render(<PdfMergeTool tool={tool} />)
    const files = [new File(['a'], 'a.pdf', { type: 'application/pdf' }), new File(['b'], 'b.pdf', { type: 'application/pdf' })]
    fireEvent.change(screen.getByLabelText('选择 PDF 文件'), { target: { files } })
    await screen.findByText('a.pdf')
    expect(screen.getByText('b.pdf')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '上移 b.pdf' }))
    fireEvent.click(screen.getByRole('button', { name: '移除 a.pdf' }))
    expect(screen.queryByText('a.pdf')).toBeNull()
  })

  it('merges and presents a downloadable result', async () => {
    render(<PdfMergeTool tool={tool} />)
    const files = [new File(['a'], 'a.pdf', { type: 'application/pdf' }), new File(['b'], 'b.pdf', { type: 'application/pdf' })]
    fireEvent.change(screen.getByLabelText('选择 PDF 文件'), { target: { files } })
    await screen.findByText('a.pdf')
    fireEvent.click(screen.getByRole('button', { name: /开始合并/ }))
    await waitFor(() => expect(screen.getByRole('link', { name: /下载合并后的 PDF/ })).toBeTruthy())
    expect(mocks.merge).toHaveBeenCalledOnce()
    expect(screen.getByRole('status').textContent).toContain('合并完成')
  })

  it('updates page selections and blocks merging when an expression is invalid', async () => {
    render(<PdfMergeTool tool={tool} />)
    const files = [new File(['a'], 'a.pdf', { type: 'application/pdf' }), new File(['b'], 'b.pdf', { type: 'application/pdf' })]
    fireEvent.change(screen.getByLabelText('选择 PDF 文件'), { target: { files } })
    await screen.findByText('a.pdf')
    const input = screen.getByLabelText('a.pdf 合并页码')
    fireEvent.change(input, { target: { value: '2,1' } })
    expect((input as HTMLInputElement).getAttribute('aria-invalid')).toBe('false')
    expect(screen.getByText('待合并页数').parentElement?.textContent).toContain('5')
    fireEvent.change(input, { target: { value: '3' } })
    expect(screen.getByRole('alert').textContent).toContain('超出 1-2 页范围')
    expect((screen.getByRole('button', { name: /开始合并/ }) as HTMLButtonElement).disabled).toBe(true)
  })
})
