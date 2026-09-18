// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import MarkdownPreview from './MarkdownPreview'

afterEach(cleanup)

describe('MarkdownPreview', () => {
  it('renders GFM content as a readable preview', () => {
    render(<MarkdownPreview source={`# 转换报告

| 项目 | 状态 |
| --- | --- |
| 表格 | 完成 |

- [x] 已转换

[查看说明](https://example.com/docs)`} />)

    expect(screen.getByRole('heading', { name: '转换报告' })).toBeTruthy()
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.getByRole('checkbox')).toHaveProperty('checked', true)
    expect(screen.getByRole('link', { name: '查看说明' }).getAttribute('rel')).toBe('noreferrer noopener')
  })

  it('does not execute raw HTML or load images from converted documents', () => {
    const { container } = render(<MarkdownPreview source={'<script>alert(1)</script>\n\n![跟踪图](https://example.com/probe.png)'} />)

    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText(/跟踪图.*未在预览中加载/)).toBeTruthy()
  })

  it('shows a useful empty state when the converter returns no text', () => {
    render(<MarkdownPreview source="   " />)

    expect(screen.getByText('没有可预览的正文')).toBeTruthy()
    expect(screen.getByText(/扫描图片/)).toBeTruthy()
  })

  it('bounds the rendered preview without changing the exported source', () => {
    render(<MarkdownPreview source={`# 大文档\n\n${'a'.repeat(300_001)}`} />)

    expect(screen.getByText('预览已折叠后续内容')).toBeTruthy()
    expect(screen.getByText(/复制和下载仍包含完整 Markdown/)).toBeTruthy()
  })
})
