// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolDescriptor } from '../../types/tool'
import JsonFormatterTool from './JsonFormatterTool'

afterEach(cleanup)

const tool: ToolDescriptor = {
  slug: 'json-formatter',
  displayName: 'JSON 格式化',
  description: 'test',
  categoryCode: 'developer',
  iconKey: 'braces',
  routePath: '/tools/json-formatter',
  executionMode: 'CLIENT',
  frontendKey: 'developer.json.format.v1',
}

describe('JsonFormatterTool', () => {
  it('renders disclosure arrows as CSS controls with explicit expansion state', () => {
    render(<JsonFormatterTool tool={tool} />)

    const rootToggle = screen.getByRole('button', { name: '折叠 root' })
    expect(rootToggle.textContent).toBe('')
    expect(rootToggle.getAttribute('data-expanded')).toBe('true')

    fireEvent.click(rootToggle)
    expect(screen.getByRole('button', { name: '展开 root' }).getAttribute('data-expanded')).toBe('false')
  })

  it('formats the input text and preserves a long integer in the result tree', () => {
    render(<JsonFormatterTool tool={tool} />)
    const input = screen.getByLabelText('JSON 输入') as HTMLTextAreaElement
    fireEvent.change(input, {
      target: { value: '{"id":9223372036854775807,"name":"device"}' },
    })

    fireEvent.click(screen.getByRole('button', { name: '格式化' }))

    expect(input.value).toContain('\n\t"id": 9223372036854775807')
    expect(screen.getByText('格式化完成')).toBeTruthy()
    expect(screen.getByText('9223372036854775807')).toBeTruthy()
    expect(screen.getByText(/已无损保留 1 个高精度数字/)).toBeTruthy()
  })

  it('clears stale results and focuses the syntax error in the input editor', async () => {
    render(<JsonFormatterTool tool={tool} />)
    const input = screen.getByLabelText('JSON 输入') as HTMLTextAreaElement
    fireEvent.change(input, {
      target: { value: '{\n  "id": 1,\n}' },
    })

    fireEvent.click(screen.getByRole('button', { name: '校验' }))

    expect(screen.getByRole('alert').textContent).toContain('第 3 行，第 1 列')
    expect(screen.queryByText('service')).toBeNull()
    expect(screen.getByText('格式化失败，请修正左侧已定位的语法错误。')).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(input))
    expect(input.selectionStart).toBeGreaterThan(0)
    expect(input.closest('section')?.classList.contains('is-error-locating')).toBe(true)
  })

  it('minifies only the input text while keeping the result as a tree', () => {
    render(<JsonFormatterTool tool={tool} />)
    const input = screen.getByLabelText('JSON 输入') as HTMLTextAreaElement
    fireEvent.change(input, {
      target: { value: '{\n  "nested": {\n    "enabled": true\n  }\n}' },
    })

    fireEvent.click(screen.getByRole('button', { name: '压缩' }))

    expect(input.value).toBe('{"nested":{"enabled":true}}')
    expect(screen.getByText('nested')).toBeTruthy()
    expect(screen.getByText('enabled')).toBeTruthy()
    expect(screen.getByText('true')).toBeTruthy()
  })

  it('automatically previews JSON pasted into the input', () => {
    render(<JsonFormatterTool tool={tool} />)
    const input = screen.getByLabelText('JSON 输入') as HTMLTextAreaElement
    input.setSelectionRange(0, input.value.length)

    fireEvent.paste(input, {
      clipboardData: { getData: () => '{"clipboard":{"ok":true}}' },
    })

    expect(input.value).toBe('{"clipboard":{"ok":true}}')
    expect(screen.getByText('已从剪贴板读取并自动生成树形结果')).toBeTruthy()
    expect(screen.getByText('clipboard')).toBeTruthy()
    expect(screen.getByText('ok')).toBeTruthy()
  })

  it('reports an incomplete pasted document instead of retaining the previous tree', async () => {
    render(<JsonFormatterTool tool={tool} />)
    const input = screen.getByLabelText('JSON 输入') as HTMLTextAreaElement
    input.setSelectionRange(0, input.value.length)

    fireEvent.paste(input, {
      clipboardData: { getData: () => '{"incomplete":' },
    })

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.queryByText('service')).toBeNull()
    expect(screen.getByText('格式化失败，请修正左侧已定位的语法错误。')).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(input))
  })

  it('automatically previews a selected JSON file', async () => {
    render(<JsonFormatterTool tool={tool} />)
    const file = {
      name: 'device.json',
      size: 28,
      text: async () => '{"fromFile":{"ready":true}}',
    } as File

    fireEvent.change(screen.getByLabelText('打开 JSON 文件'), {
      target: { files: [file] },
    })

    await waitFor(() => {
      expect(screen.getByText('已载入并自动格式化 device.json')).toBeTruthy()
      expect(screen.getByText('fromFile')).toBeTruthy()
      expect(screen.getByText('ready')).toBeTruthy()
    })
  })

  it('keeps icon source actions and configuration on the input panel and key sorting on the result panel', () => {
    render(<JsonFormatterTool tool={tool} />)
    const input = screen.getByLabelText('JSON 输入') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '{"z":1,"a":2}' } })
    fireEvent.click(screen.getByRole('button', { name: '格式化' }))
    const formattedInput = input.value

    const formatPanel = screen.getByRole('button', { name: '格式化' }).closest('section')
    const sortButton = screen.getByRole('button', { name: '键排序' })
    const sortPanel = sortButton.closest('section')
    expect(formatPanel?.querySelector('h2')?.textContent).toBe('输入')
    expect(sortPanel?.querySelector('h2')?.textContent).toBe('结果')
    expect(screen.queryByLabelText('JSON 输入配置栏')).toBeNull()

    for (const label of ['格式化', '校验', '压缩', '转义', '去转义', '打开文件', '清空', '载入示例', '结果回填']) {
      const button = screen.getByRole('button', { name: label })
      expect(button.closest('section')).toBe(formatPanel)
      expect(button.getAttribute('title')).toBe(label)
      expect(button.getAttribute('data-tooltip')).toBe(label)
      expect(button.querySelector('svg')).toBeTruthy()
      expect(button.textContent).toBe('')
    }

    expect(screen.getByLabelText('缩进').closest('section')).toBe(formatPanel)

    fireEvent.click(sortButton)
    fireEvent.click(screen.getByRole('button', { name: '文本' }))
    const sortedOutput = (screen.getByLabelText('JSON 结果') as HTMLTextAreaElement).value
    expect(input.value).toBe(formattedInput)
    expect(sortedOutput.indexOf('"a"')).toBeLessThan(sortedOutput.indexOf('"z"'))
  })

  it('exposes an editable text result view', () => {
    render(<JsonFormatterTool tool={tool} />)
    fireEvent.click(screen.getByRole('button', { name: '文本' }))

    const result = screen.getByLabelText('JSON 结果') as HTMLTextAreaElement
    fireEvent.change(result, { target: { value: '{"edited":true}' } })
    expect(result.value).toBe('{"edited":true}')
    expect(screen.getByText(/结果已手动修改/)).toBeTruthy()
  })

  it('defaults to Tab in the custom indentation listbox and supports keyboard dismissal', () => {
    render(<JsonFormatterTool tool={tool} />)
    const indentation = screen.getByRole('button', { name: '缩进' })
    expect(indentation.textContent).toContain('Tab')
    expect(indentation.getAttribute('aria-expanded')).toBe('false')
    expect((screen.getByLabelText('JSON 输入') as HTMLTextAreaElement).value).toContain('\n\t"service"')

    fireEvent.click(indentation)

    expect(indentation.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('listbox', { name: '缩进选项' })).toBeTruthy()
    expect(screen.getByRole('option', { name: /Tab/ }).getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(screen.getByRole('listbox', { name: '缩进选项' }), { key: 'Escape' })

    expect(indentation.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('listbox', { name: '缩进选项' })).toBeNull()
  })

  it('applies a selected custom indentation option', () => {
    render(<JsonFormatterTool tool={tool} />)
    const indentation = screen.getByRole('button', { name: '缩进' })
    fireEvent.click(indentation)
    fireEvent.click(screen.getByRole('option', { name: /2 空格/ }))

    expect(indentation.textContent).toContain('2 空格')
    expect(indentation.getAttribute('aria-expanded')).toBe('false')
    fireEvent.change(screen.getByLabelText('JSON 输入'), {
      target: { value: '{"nested":{"enabled":true}}' },
    })
    fireEvent.click(screen.getByRole('button', { name: '格式化' }))

    expect((screen.getByLabelText('JSON 输入') as HTMLTextAreaElement).value).toContain('\n  "nested"')
  })

  it('focuses the first search match, expands only its branch, and navigates between matches', () => {
    render(<JsonFormatterTool tool={tool} />)
    fireEvent.change(screen.getByLabelText('JSON 输入'), {
      target: { value: '{"first":{"deviceId":"A"},"second":{"deviceId":"B"}}' },
    })
    fireEvent.click(screen.getByRole('button', { name: '格式化' }))
    fireEvent.change(screen.getByLabelText('搜索 JSON 结果'), { target: { value: 'deviceId' } })

    expect(screen.getByText('1 / 2')).toBeTruthy()
    expect(screen.getByText('正在查看第 1 项，共 2 项')).toBeTruthy()
    expect(screen.getByText('"A"')).toBeTruthy()
    expect(screen.queryByText('"B"')).toBeNull()
    expect(screen.getByRole('button', { name: '折叠 first' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '展开 second' })).toBeTruthy()
    expect((screen.getByRole('button', { name: '全部展开' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '下一个匹配项' }))

    expect(screen.getByText('2 / 2')).toBeTruthy()
    expect(screen.queryByText('"A"')).toBeNull()
    expect(screen.getByText('"B"')).toBeTruthy()
    expect(screen.getByRole('button', { name: '展开 first' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '折叠 second' })).toBeTruthy()

    fireEvent.keyDown(screen.getByLabelText('搜索 JSON 结果'), { key: 'Enter', shiftKey: true })
    expect(screen.getByText('1 / 2')).toBeTruthy()
    expect(screen.getByText('"A"')).toBeTruthy()
    expect(screen.queryByText('"B"')).toBeNull()
  })

  it('reveals a match beyond the first tree page without rendering every preceding field', () => {
    const largeObject = Object.fromEntries([
      ...Array.from({ length: 120 }, (_, index) => [`field${index}`, index]),
      ['windInfo', { speed: 0 }],
    ])
    render(<JsonFormatterTool tool={tool} />)
    fireEvent.change(screen.getByLabelText('JSON 输入'), {
      target: { value: JSON.stringify(largeObject) },
    })
    fireEvent.click(screen.getByRole('button', { name: '格式化' }))
    fireEvent.change(screen.getByLabelText('搜索 JSON 结果'), { target: { value: 'wind' } })

    expect(screen.getByText('windInfo').classList.contains('is-search-match')).toBe(true)
    expect(screen.queryByText('field119')).toBeNull()
    expect(screen.getByText(/再显示 20 项/)).toBeTruthy()
  })
})
