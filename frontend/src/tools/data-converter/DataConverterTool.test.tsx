// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolDescriptor } from '../../types/tool'
import DataConverterTool from './DataConverterTool'

const tool: ToolDescriptor = {
  slug: 'data-converter',
  displayName: '数据格式转换',
  description: 'JSON、YAML 与 Properties 互转',
  categoryCode: 'developer',
  iconKey: 'json',
  routePath: '/tools/data-converter',
  executionMode: 'CLIENT',
  frontendKey: 'developer.data.convert.v1',
}

afterEach(cleanup)

describe('DataConverterTool', () => {
  it('starts with a local Properties-to-YAML conversion and structural statistics', () => {
    const { container } = render(<DataConverterTool tool={tool} />)

    expect(screen.getByRole('textbox', { name: '源配置内容' })).toHaveProperty('value', expect.stringContaining('service.name'))
    expect(container.querySelector('.data-output-code')?.textContent).toContain('service:')
    expect(screen.getByRole('group', { name: '选择源格式' }).querySelector('button')?.className).toContain('is-active')
    expect(screen.getByText('当前识别为 Properties')).toBeTruthy()
    expect(container.querySelector('.data-source-detected')?.textContent).toBe('Properties')
    expect(screen.getByText('浏览器本地处理')).toBeTruthy()
    expect(screen.getByText('配置字段')).toBeTruthy()
    expect([...container.querySelectorAll('.data-token-key')].some((token) => token.textContent === 'service')).toBe(true)
    expect([...container.querySelectorAll('.data-token-value')].some((token) => token.textContent === 'tool-web')).toBe(true)
  })

  it('groups structural and output rules and reflects the selected indentation in editor guides', async () => {
    const { container } = render(<DataConverterTool tool={tool} />)

    expect(screen.getByText('结构规则')).toBeTruthy()
    expect(screen.getByText('YAML 输出排版')).toBeTruthy()
    expect(screen.getByText('已格式化')).toBeTruthy()
    expect(container.querySelectorAll('.data-output-canvas.has-guides')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'YAML 缩进' }))
    fireEvent.click(screen.getByRole('option', { name: '4 空格' }))

    await waitFor(() => expect(container.querySelectorAll('.data-indent-guides i').length).toBeGreaterThan(0))
    const guideSegments = [...container.querySelectorAll<HTMLElement>('.data-indent-guides i')]
    expect(guideSegments.length).toBeGreaterThan(0)
    expect(guideSegments.some((guide) => guide.style.getPropertyValue('--data-guide-column') === '4')).toBe(true)
    expect(guideSegments.every((guide) => Number(guide.style.getPropertyValue('--data-guide-lines')) > 0)).toBe(true)
  })

  it('closes a settings menu with Escape and restores focus to its trigger', () => {
    render(<DataConverterTool tool={tool} />)

    const trigger = screen.getByRole('button', { name: 'YAML 缩进' })
    fireEvent.click(trigger)
    expect(screen.getByRole('listbox', { name: 'YAML 缩进选项' })).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('listbox', { name: 'YAML 缩进选项' })).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('uses the JSON-specific guide alignment when JSON is the target format', async () => {
    const { container } = render(<DataConverterTool tool={tool} />)

    fireEvent.click(screen.getByRole('group', { name: '选择目标格式' }).querySelector('button:first-child')!)

    await waitFor(() => expect(container.querySelector('.data-indent-guides.is-json')).toBeTruthy())
    expect([...container.querySelectorAll('.data-token-key')].some((token) => token.textContent === '"service"')).toBe(true)
  })

  it('merges duplicate Properties entries with the selected strategy', async () => {
    render(<DataConverterTool tool={tool} />)

    fireEvent.click(screen.getByRole('group', { name: '选择目标格式' }).querySelector('button:first-child')!)
    fireEvent.change(screen.getByRole('textbox', { name: '源配置内容' }), {
      target: { value: 'service.name=primary\nservice.name=backup' },
    })
    fireEvent.click(screen.getByRole('button', { name: '重复键' }))
    fireEvent.click(screen.getByRole('option', { name: '合并为数组' }))

    await waitFor(() => expect(document.querySelector('.data-output-code')?.textContent).toContain('"name": ['))
    expect(screen.getByText(/重复配置 service.name/)).toBeTruthy()
  })

  it('auto-detects and converts YAML when a mapping value contains equals signs', async () => {
    const { container } = render(<DataConverterTool tool={tool} />)

    fireEvent.change(screen.getByRole('textbox', { name: '源配置内容' }), {
      target: { value: 'service:\n  endpoint: https://example.com/api?mode=full&enabled=true' },
    })
    expect(container.querySelector('.data-source-detected')?.textContent).toBe('YAML')
    expect(screen.queryByRole('button', { name: '转换' })).toBeNull()
    expect(screen.getByText('自动转换已开启')).toBeTruthy()

    await waitFor(() => expect(screen.getByText(/已自动识别为 YAML，并转换为 YAML/)).toBeTruthy())
    expect(screen.getByText('当前识别为 YAML')).toBeTruthy()
  })

  it('automatically resolves repeated YAML object blocks with the selected strategy', async () => {
    render(<DataConverterTool tool={tool} />)
    fireEvent.click(screen.getByRole('group', { name: '选择目标格式' }).querySelector('button:last-child')!)
    fireEvent.change(screen.getByRole('textbox', { name: '源配置内容' }), {
      target: { value: 'logging:\n  level: INFO\nlogging:\n  level: DEBUG' },
    })

    await waitFor(() => expect(document.querySelector('.data-output-code')?.textContent).toContain('logging.level=DEBUG'))
    expect(screen.getByText(/YAML 重复配置 logging/)).toBeTruthy()
  })

  it('shows a located parse error for malformed JSON', async () => {
    render(<DataConverterTool tool={tool} />)

    fireEvent.click(screen.getByRole('group', { name: '选择源格式' }).querySelector('button:nth-child(2)')!)
    fireEvent.change(screen.getByRole('textbox', { name: '源配置内容' }), { target: { value: '{"name":' } })
    fireEvent.click(screen.getByRole('button', { name: '转换' }))

    expect(screen.getByRole('alert').textContent).toContain('JSON')
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '源配置内容' })))
  })

  it('blocks conversion when the manually selected format differs from the detected content', () => {
    const { container } = render(<DataConverterTool tool={tool} />)

    fireEvent.click(screen.getByRole('group', { name: '选择源格式' }).querySelector('button:nth-child(3)')!)

    expect(screen.getByRole('alert').textContent).toContain('当前选择为 YAML，实际检测为 Properties')
    expect(container.querySelector('.data-output-code')).toBeNull()
    expect(screen.getByText('等待结构转换')).toBeTruthy()
  })

  it('rejects files above the browser processing limit', async () => {
    render(<DataConverterTool tool={tool} />)
    const file = new File(['{}'], 'large.json', { type: 'application/json' })
    Object.defineProperty(file, 'size', { value: 3 * 1024 * 1024 + 1 })

    fireEvent.change(screen.getByLabelText('导入配置文件'), { target: { files: [file] } })

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('3.0 MB'))
  })
})
