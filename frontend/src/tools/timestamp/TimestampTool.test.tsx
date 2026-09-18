// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ToolDescriptor } from '../../types/tool'
import TimestampTool from './TimestampTool'

const tool: ToolDescriptor = { slug: 'timestamp-converter', displayName: '时间戳转换', description: 'test', categoryCode: 'developer', iconKey: 'clock', routePath: '/tools/timestamp-converter', executionMode: 'CLIENT', frontendKey: 'developer.datetime.v1' }

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('TimestampTool', () => {
  it('groups live refresh with the clock and preserves pause/resume behavior', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    render(<TimestampTool tool={tool} />)
    const toggle = screen.getByRole('button', { name: '实时刷新' })
    expect(toggle.closest('.ts-now-copy')?.textContent).toContain('当前时间')
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByRole('button', { name: /^UNIX · 毫秒/ }).textContent).toContain('1704067201000')
    fireEvent.click(toggle)
    expect(toggle.textContent).toBe('已暂停')
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.getByRole('button', { name: /^UNIX · 毫秒/ }).textContent).toContain('1704067201000')
    fireEvent.click(toggle)
    act(() => vi.advanceTimersByTime(250))
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /^UNIX · 毫秒/ }).textContent).toContain('1704067206250')
  })

  it('keeps the current millisecond integer unchanged when switching to auto', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-12T06:47:08.904Z'))
    render(<TimestampTool tool={tool} />)
    const input = screen.getByLabelText('输入时间戳') as HTMLInputElement
    fireEvent.click(screen.getByRole('button', { name: '使用当前' }))
    expect(input.value).toBe('1789195628904')
    expect(screen.getByRole('button', { name: '毫秒' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '自动识别' }))
    expect(input.value).toBe('1789195628904')
    expect(screen.getByRole('button', { name: '自动识别' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('2026-09-12T06:47:08.904Z')).toBeTruthy()
    expect(screen.getByText('识别为毫秒级时间戳')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('输入保持不变')
  })

  it('rewrites the input on unit switches and keeps the displayed date unchanged', () => {
    render(<TimestampTool tool={tool} />)
    const input = screen.getByLabelText('输入时间戳') as HTMLInputElement
    fireEvent.change(input, { target: { value: '1789195154' } })
    expect(screen.getByText('2026-09-12T06:39:14.000Z')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '毫秒' }))
    expect(input.value).toBe('1789195154000')
    expect(screen.getByText('2026-09-12T06:39:14.000Z')).toBeTruthy()
    expect(screen.getByRole('button', { name: '毫秒' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.change(input, { target: { value: '1789195154123' } })
    fireEvent.click(screen.getByRole('button', { name: '秒' }))
    expect(input.value).toBe('1789195154.123')
    expect(screen.getByText('2026-09-12T06:39:14.123Z')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '自动识别' }))
    expect(input.value).toBe('1789195154.123')
    expect(screen.getByText('2026-09-12T06:39:14.123Z')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '微秒' })).toBeNull()
    expect(screen.queryByRole('button', { name: '纳秒' })).toBeNull()
  })

  it('keeps single and batch unit settings independent and converts batch input consistently', () => {
    render(<TimestampTool tool={tool} />)
    fireEvent.change(screen.getByLabelText('输入时间戳'), { target: { value: '1789195154' } })
    fireEvent.click(screen.getByRole('button', { name: '毫秒' }))
    fireEvent.click(screen.getByRole('button', { name: '批量转换' }))
    expect(screen.getByRole('button', { name: '自动识别' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.change(screen.getByLabelText('批量时间戳'), { target: { value: '1789195154\n1789195154123' } })
    fireEvent.click(screen.getByRole('button', { name: '毫秒' }))
    expect((screen.getByLabelText('批量时间戳') as HTMLTextAreaElement).value).toBe('1789195154000\n1789195154123')
    fireEvent.click(screen.getByRole('button', { name: '自动识别' }))
    expect((screen.getByLabelText('批量时间戳') as HTMLTextAreaElement).value).toBe('1789195154000\n1789195154123')
    expect(screen.getByRole('status').textContent).toContain('输入保持不变')
    fireEvent.click(screen.getByRole('button', { name: /开始转换/ }))
    expect(screen.getByText('2026-09-12T06:39:14.000Z')).toBeTruthy()
    expect(screen.getByText('2026-09-12T06:39:14.123Z')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '秒' }))
    fireEvent.click(screen.getByRole('button', { name: '单次转换' }))
    expect((screen.getByLabelText('输入时间戳') as HTMLInputElement).value).toBe('1789195154000')
    expect(screen.getByRole('button', { name: '毫秒' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('keeps invalid input editable and does not show a stale result', () => {
    render(<TimestampTool tool={tool} />)
    fireEvent.change(screen.getByLabelText('输入时间戳'), { target: { value: '1789195154' } })
    fireEvent.change(screen.getByLabelText('输入时间戳'), { target: { value: 'invalid' } })
    fireEvent.click(screen.getByRole('button', { name: '毫秒' }))
    expect((screen.getByLabelText('输入时间戳') as HTMLInputElement).value).toBe('invalid')
    expect(screen.queryByText('2026-09-12T06:39:14.000Z')).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('请输入秒或毫秒')
  })

  it('converts timestamp input immediately and copies the ISO result', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(<TimestampTool tool={tool} />)
    fireEvent.change(screen.getByLabelText('输入时间戳'), { target: { value: '1704067200' } })
    expect(screen.getAllByText('2024-01-01T00:00:00.000Z')).toHaveLength(2)
    fireEvent.click(screen.getByLabelText('复制ISO 8601'))
    expect(writeText).toHaveBeenCalledWith('2024-01-01T00:00:00.000Z')
  })

  it('offers an accessible timezone picker and batch errors per row', () => {
    render(<TimestampTool tool={tool} />)
    const picker = screen.getByLabelText('选择时区')
    expect(picker.querySelector('svg.ts-zone-chevron')?.getAttribute('aria-hidden')).toBe('true')
    expect(picker.textContent).not.toContain('⌄')
    fireEvent.click(picker)
    expect(picker.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(screen.getByRole('option', { name: /北京 \/ 上海/ }))
    expect(picker).toHaveProperty('textContent', expect.stringContaining('北京 / 上海'))
    fireEvent.click(screen.getByRole('button', { name: '批量转换' }))
    fireEvent.change(screen.getByLabelText('批量时间戳'), { target: { value: '1704067200\nbad' } })
    fireEvent.click(screen.getByRole('button', { name: /开始转换/ }))
    expect(screen.getByText(/其中 1 行无法识别/)).toBeTruthy()
    expect(screen.getByText('bad')).toBeTruthy()
  })

  it('displays and copies all six formats, refreshes them on zone changes, and clears invalid results', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(<TimestampTool tool={tool} />)
    fireEvent.click(screen.getByLabelText('选择时区'))
    fireEvent.click(screen.getByRole('option', { name: /北京 \/ 上海/ }))
    fireEvent.change(screen.getByLabelText('输入时间戳'), { target: { value: '1704067200123' } })
    const values = {
      '常见格式': '2024-01-01 08:00:00', '中文格式': '2024年01月01日 08时00分00秒',
      '标准时间': 'Mon Jan 01 2024 08:00:00 GMT+0800 (Asia/Shanghai)', 'ISO 8601': '2024-01-01T00:00:00.123Z',
      'RFC 3339': '2024-01-01T08:00:00.123+08:00', 'RFC 5322': 'Mon, 01 Jan 2024 08:00:00 +0800',
    }
    for (const [label, value] of Object.entries(values)) {
      expect(screen.getByText(value)).toBeTruthy()
      await act(async () => fireEvent.click(screen.getByRole('button', { name: `复制${label}` })))
      expect(writeText).toHaveBeenLastCalledWith(value)
    }
    fireEvent.click(screen.getByText('更多格式 · UTC / GMT、完整时间'))
    expect(screen.getByRole('button', { name: '复制UTC / GMT' })).toBeTruthy()
    fireEvent.click(screen.getByLabelText('选择时区'))
    fireEvent.click(screen.getByRole('option', { name: /纽约/ }))
    expect(screen.getByText('2023-12-31T19:00:00.123-05:00')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('输入时间戳'), { target: { value: 'invalid' } })
    expect(screen.queryByRole('button', { name: '复制RFC 3339' })).toBeNull()
    expect(screen.queryByText('2023-12-31T19:00:00.123-05:00')).toBeNull()
  })

  it('disables copying RFC formats outside their year range', () => {
    render(<TimestampTool tool={tool} />)
    fireEvent.click(screen.getByLabelText('选择时区'))
    fireEvent.click(screen.getByRole('option', { name: /协调世界时/ }))
    fireEvent.change(screen.getByLabelText('输入时间戳'), { target: { value: String(Date.parse('1899-01-01T00:00:00Z')) } })
    expect((screen.getByRole('button', { name: '复制RFC 5322' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('RFC 5322 仅支持 1900 年及以后')).toBeTruthy()
    expect((screen.getByRole('button', { name: '复制RFC 3339' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('separates full-width formats from both conversion cards without mixing their inputs', () => {
    render(<TimestampTool tool={tool} />)
    expect(screen.queryByRole('region', { name: '时间戳多格式结果' })).toBeNull()
    fireEvent.change(screen.getByLabelText('输入时间戳'), { target: { value: '1704067200123' } })
    const formats = screen.getByRole('region', { name: '时间戳多格式结果' })
    const toDate = screen.getByRole('region', { name: '时间戳转日期时间' })
    const toTimestamp = screen.getByRole('region', { name: '日期时间转时间戳' })
    expect(formats.closest('.ts-single')).toBeNull()
    expect(toDate.contains(formats)).toBe(false)
    expect(toTimestamp.contains(formats)).toBe(false)
    expect(within(formats).getByText('来自时间戳输入')).toBeTruthy()
    expect(within(formats.querySelector('.ts-format-grid')!).getAllByRole('button')).toHaveLength(6)
    expect(within(toDate).getByText('识别为毫秒级时间戳')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('日期与时间'), { target: { value: '2025-06-01 12:30:00.000' } })
    expect(within(formats).getByText('2024-01-01T00:00:00.123Z')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '批量转换' }))
    expect(screen.queryByRole('region', { name: '时间戳多格式结果' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '单次转换' }))
    expect(within(screen.getByRole('region', { name: '时间戳多格式结果' })).getByText('2024-01-01T00:00:00.123Z')).toBeTruthy()
    expect((screen.getByLabelText('日期与时间') as HTMLInputElement).value).toBe('2025-06-01 12:30:00.000')
    fireEvent.change(screen.getByLabelText('输入时间戳'), { target: { value: '' } })
    expect(screen.queryByRole('region', { name: '时间戳多格式结果' })).toBeNull()
  })
})
