// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolDescriptor } from '../../types/tool'
import WorldTimeTool from './WorldTimeTool'

const tool: ToolDescriptor = { slug: 'world-time', displayName: '世界时间', description: 'test', categoryCode: 'other', iconKey: 'clock', routePath: '/tools/world-time', executionMode: 'CLIENT', frontendKey: 'utilities.world-time.v1' }

const dialogMethods = ['showModal', 'close'] as const
const originalMethods = dialogMethods.map((name) => Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name))
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.open = true } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.open = false } })
})
afterAll(() => dialogMethods.forEach((name, index) => {
  const original = originalMethods[index]
  if (original) Object.defineProperty(HTMLDialogElement.prototype, name, original)
  else Reflect.deleteProperty(HTMLDialogElement.prototype, name)
}))

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('WorldTimeTool', () => {
  it('shows default live clocks and adds a searched city', () => {
    render(<WorldTimeTool tool={tool} />)
    expect(screen.getByText('本地时间')).toBeTruthy()
    expect(screen.getByText('全球时刻')).toBeTruthy()
    expect(screen.getAllByText('北京').length).toBeGreaterThan(1)
    expect(screen.getAllByText('伦敦').length).toBeGreaterThan(1)
    fireEvent.change(screen.getByLabelText('搜索城市或时区'), { target: { value: '多伦多' } })
    fireEvent.click(screen.getByRole('button', { name: /多伦多/ }))
    expect(screen.getAllByText('多伦多').length).toBeGreaterThan(1)
    expect(screen.getByRole('status').textContent).toContain('已添加多伦多')
  })

  it('switches to planned conversion with a custom seconds-only date picker', () => {
    render(<WorldTimeTool tool={tool} />)
    fireEvent.click(screen.getByRole('button', { name: '指定时间' }))
    const input = screen.getByLabelText('当地日期与时间') as HTMLInputElement
    expect(screen.getByRole('button', { name: '选择时间所属城市' }).textContent).toContain('北京')
    expect((input as HTMLInputElement).value).not.toBe('')
    expect(input.value).toMatch(/:\d{2}:\d{2}$/)
    fireEvent.click(screen.getByRole('button', { name: '选择当地日期与时间' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getAllByRole('listbox')).toHaveLength(3)
    expect(screen.queryByRole('textbox', { name: '输入毫秒' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
  })

  it('filters and selects the source city with the custom animated listbox', async () => {
    render(<WorldTimeTool tool={tool} />)
    fireEvent.click(screen.getByRole('button', { name: '指定时间' }))
    const trigger = screen.getByRole('button', { name: '选择时间所属城市' })
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    const menu = document.querySelector<HTMLElement>('.world-city-menu')!
    expect(menu.closest('.world-time-control')).toBeNull()
    expect(menu.parentElement?.parentElement).toBe(document.body)
    expect(menu.parentElement?.classList.contains('world-city-layer')).toBe(true)
    expect(screen.getByRole('dialog', { name: '选择时间所属城市' })).toBe(menu)
    expect(trigger.getAttribute('aria-controls')).toBe(menu.id)
    const closeButton = screen.getByRole('button', { name: '关闭时间所属城市选择' })
    closeButton.focus()
    fireEvent.keyDown(closeButton, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(screen.getAllByRole('option').at(-1))
    fireEvent.change(screen.getByRole('searchbox', { name: '筛选时间所属城市' }), { target: { value: '洛杉矶' } })
    const option = screen.getByRole('option', { name: /洛杉矶/ })
    expect(option.textContent).toContain('America/Los_Angeles')
    fireEvent.click(option)
    expect(trigger.textContent).toContain('洛杉矶')
    expect(screen.queryByRole('listbox', { name: '时间所属城市选项' })).toBeNull()

    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: '关闭时间所属城市选择遮罩' }))
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await waitFor(() => expect(document.activeElement).toBe(trigger))

    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole('searchbox', { name: '筛选时间所属城市' }), { key: 'Escape' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('prevents removing the final city', () => {
  localStorage.setItem('tool-web.world-time.cities.v2', JSON.stringify(['shanghai']))
    render(<WorldTimeTool tool={tool} />)
    fireEvent.click(screen.getByRole('button', { name: '移除上海' }))
    expect(screen.getByRole('alert').textContent).toContain('至少保留一个城市')
  })

  it('falls back to the first displayed city when Beijing is not available', () => {
    localStorage.setItem('tool-web.world-time.cities.v2', JSON.stringify(['shanghai', 'tokyo']))
    render(<WorldTimeTool tool={tool} />)
    fireEvent.click(screen.getByRole('button', { name: '指定时间' }))
    expect(screen.getByRole('button', { name: '选择时间所属城市' }).textContent).toContain('上海')
  })

  it('uses the nine default cities and labels timeline day periods', () => {
    render(<WorldTimeTool tool={tool} />)
    for (const name of ['悉尼', '东京', '北京', '洛杉矶', '迪拜', '伦敦', '巴黎', '莫斯科', '纽约']) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(1)
    }
    expect(document.querySelectorAll('.world-global-marker .world-period-icon')).toHaveLength(9)
    expect(document.querySelectorAll('.world-city-offset .world-period-icon')).toHaveLength(9)
    expect(document.querySelectorAll('.world-global-marker small[title]')).toHaveLength(9)
    expect(document.querySelectorAll('.world-global-track > .world-day-band i')).toHaveLength(11)
    expect(document.querySelectorAll('.world-period-axis span')).toHaveLength(5)
  })

  it('previews, locks, and clears a timeline city with accessible controls', () => {
    render(<WorldTimeTool tool={tool} />)
    const marker = screen.getByRole('button', { name: /洛杉矶 .*点击锁定/ })

    fireEvent.mouseEnter(marker)
    expect(marker.classList.contains('is-active')).toBe(true)
    expect(document.querySelector('.world-timeline-inspector')?.textContent).toContain('洛杉矶')

    fireEvent.click(marker)
    fireEvent.mouseLeave(marker)
    expect(marker.getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('.world-timeline-inspector')?.textContent).toContain('已锁定')

    fireEvent.keyDown(marker, { key: 'Escape' })
    expect(marker.getAttribute('aria-pressed')).toBe('false')
    expect(document.querySelector('.world-timeline-inspector')?.textContent).toContain('将指针移到城市上')
  })

  it('migrates only the untouched legacy default and preserves customized Singapore clocks', () => {
    localStorage.setItem('tool-web.world-time.cities.v2', JSON.stringify(['sydney', 'tokyo', 'beijing', 'singapore', 'dubai', 'london', 'paris', 'moscow', 'new-york']))
    const first = render(<WorldTimeTool tool={tool} />)
    expect([...document.querySelectorAll('.world-global-marker')].map((marker) => marker.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('洛杉矶')]))
    expect([...document.querySelectorAll('.world-global-marker')].some((marker) => marker.textContent?.includes('新加坡'))).toBe(false)
    first.unmount()

    localStorage.setItem('tool-web.world-time.cities.v2', JSON.stringify(['shanghai', 'singapore']))
    render(<WorldTimeTool tool={tool} />)
    expect([...document.querySelectorAll('.world-global-marker')].some((marker) => marker.textContent?.includes('新加坡'))).toBe(true)
  })
})
