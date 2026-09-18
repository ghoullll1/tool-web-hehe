// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolDescriptor } from '../../types/tool'
import ImageConverterTool from './ImageConverterTool'

const tool: ToolDescriptor = {
  slug: 'image-converter',
  displayName: '图片格式转换',
  description: 'test',
  categoryCode: 'image',
  iconKey: 'image',
  routePath: '/tools/image-converter',
  executionMode: 'CLIENT',
  frontendKey: 'graphics.image.convert.v1',
}

beforeEach(() => {
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:preview'),
    revokeObjectURL: vi.fn(),
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ImageConverterTool', () => {
  it('starts with readable format controls and browser-local privacy guidance', () => {
    render(<ImageConverterTool tool={tool} />)

    expect(screen.getByRole('heading', { name: '一次选择，换一种清晰表达。' })).toBeTruthy()
    expect(screen.getByText('图片不会离开浏览器')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'WebP轻量高效' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByLabelText('图片质量')).toBeTruthy()
  })

  it('adds supported images and clears them as a batch', () => {
    const { container } = render(<ImageConverterTool tool={tool} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['pixels'], 'sample.png', { type: 'image/png' })] } })

    expect(screen.getByText('sample.png')).toBeTruthy()
    expect(screen.getByText(/已添加 1 张图片/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '清空全部' }))
    expect(screen.queryByText('sample.png')).toBeNull()
  })

  it('shows format-specific settings without shrinking the workflow', () => {
    render(<ImageConverterTool tool={tool} />)
    fireEvent.click(screen.getByRole('button', { name: 'PNG透明无损' }))

    expect(screen.queryByLabelText('图片质量')).toBeNull()
    expect(screen.getByText(/PNG 采用无损编码/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'JPG兼容优先' }))
    expect(screen.getByLabelText('透明区域背景颜色')).toBeTruthy()
  })

  it('rejects unsupported formats with an actionable error', () => {
    const { container } = render(<ImageConverterTool tool={tool} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['vector'], 'graphic.svg', { type: 'image/svg+xml' })] } })

    expect(screen.getByRole('alert').textContent).toContain('不是支持的 JPG、PNG 或 WebP')
  })
})
