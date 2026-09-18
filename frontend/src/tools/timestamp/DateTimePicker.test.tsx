// @vitest-environment jsdom

import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import DateTimePicker from './DateTimePicker'

const dialogMethods = ['showModal', 'close'] as const
const originalMethods = dialogMethods.map((name) => Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name))
beforeAll(() => {
  // jsdom does not implement the browser's native modal lifecycle.
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.open = true } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.open = false } })
})
afterAll(() => dialogMethods.forEach((name, index) => {
  const original = originalMethods[index]
  if (original) Object.defineProperty(HTMLDialogElement.prototype, name, original)
  else Reflect.deleteProperty(HTMLDialogElement.prototype, name)
}))
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })

function Harness({ initial = '2026-09-12T14:47:08.904', timeZone = 'UTC', precision = 'milliseconds', readOnly = false }: { initial?: string; timeZone?: string; precision?: 'seconds' | 'milliseconds'; readOnly?: boolean }) {
  const [value, setValue] = useState(initial)
  return <DateTimePicker value={value} timeZone={timeZone} precision={precision} readOnly={readOnly} onChange={setValue} />
}
const input = () => screen.getByLabelText('日期与时间') as HTMLInputElement
const open = () => fireEvent.click(screen.getByRole('button', { name: '选择日期与时间' }))
const wheel = (label: string) => screen.getByRole('listbox', { name: `选择${label}` })
const scrollTo = (label: string, value: number) => fireEvent.scroll(wheel(label), { target: { scrollTop: value * 36 } })
const selectedValue = (label: string) => wheel(label).querySelector('[aria-selected="true"]')?.textContent
const milliseconds = () => screen.getByRole('textbox', { name: '输入毫秒' }) as HTMLInputElement

describe('DateTimePicker', () => {
  it('stages day and precise time changes until apply, then reopens the committed value', () => {
    render(<Harness />); open()
    fireEvent.click(screen.getByRole('button', { name: /^2026年9月15日/ }))
    scrollTo('时', 9)
    fireEvent.change(milliseconds(), { target: { value: '7' } })
    expect(input().value).toBe('2026-09-12 14:47:08.904')
    fireEvent.click(screen.getByRole('button', { name: /应用时间/ }))
    expect(input().value).toBe('2026-09-15 09:47:08.007')
    expect(screen.queryByRole('dialog')).toBeNull()
    open()
    expect(milliseconds().value).toBe('007')
    expect(screen.getByRole('button', { name: /^2026年9月15日/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('discards drafts with cancel or Escape and permits manual text editing', () => {
    render(<Harness />); open()
    fireEvent.click(screen.getByRole('button', { name: '零点' }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(input().value).toBe('2026-09-12 14:47:08.904')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '选择日期与时间' }))
    open(); fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(input().value).toBe('2026-09-12 14:47:08.904')
    fireEvent.change(input(), { target: { value: '2024-02-29 12:34:56.789' } })
    open()
    expect(screen.getByRole('button', { name: /^2024年2月29日/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('supports keyboard month traversal and fast year/month selection', () => {
    render(<Harness initial="2024-01-31T12:00:00.000" />); open()
    fireEvent.keyDown(screen.getByRole('button', { name: /^2024年1月31日/ }), { key: 'PageDown' })
    const leapDay = screen.getByRole('button', { name: /^2024年2月29日/ })
    expect(document.activeElement).toBe(leapDay)
    fireEvent.click(leapDay)
    fireEvent.click(screen.getByRole('button', { name: '选择年月' }))
    fireEvent.click(screen.getByRole('button', { name: '选择年份' }))
    expect(screen.queryByRole('textbox', { name: '选择年份' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '2030 年' }))
    fireEvent.click(screen.getByRole('button', { name: '12 月' }))
    fireEvent.click(screen.getByRole('button', { name: /^2030年12月25日/ }))
    fireEvent.click(screen.getByRole('button', { name: /应用时间/ }))
    expect(input().value).toBe('2030-12-25 12:00:00.000')
  })

  it('restricts time to valid values, blocks DST gaps, and explains ambiguous times', () => {
    render(<Harness initial="2024-03-10T01:30:00.000" timeZone="America/New_York" />); open()
    scrollTo('时', 2)
    expect(screen.getByRole('alert').textContent).toContain('夏令时')
    expect((screen.getByRole('button', { name: /应用时间/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getAllByRole('listbox')).toHaveLength(3)
    expect(screen.getByRole('dialog').querySelectorAll('input')).toHaveLength(1)
    fireEvent.keyDown(wheel('时'), { key: 'End' })
    expect(selectedValue('时')).toBe('23')
    fireEvent.keyDown(wheel('时'), { key: 'ArrowDown' })
    expect(selectedValue('时')).toBe('23')
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    fireEvent.change(input(), { target: { value: '2024-11-03 01:30:00.000' } })
    open()
    expect(screen.getByText(/采用较早的时刻/)).toBeTruthy()
  })

  it.each([
    ['0001-01-01T00:00:00.000', '上20年', '前 100 年', '1 年'],
    ['9999-12-31T23:59:59.999', '下20年', '后 100 年', '9999 年'],
  ])('bounds selectable years for %s', (initial, pageButton, jumpButton, year) => {
    render(<Harness initial={initial} />); open()
    fireEvent.click(screen.getByRole('button', { name: '选择年月' }))
    fireEvent.click(screen.getByRole('button', { name: '选择年份' }))
    expect((screen.getByRole('button', { name: pageButton }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: jumpButton }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: year }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('button', { name: '0 年' })).toBeNull()
    expect(screen.queryByRole('button', { name: '10000 年' })).toBeNull()
  })

  it('fills now in the selected timezone including milliseconds and clamps arrow increments', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-12T18:47:08.904Z'))
    render(<Harness timeZone="Asia/Shanghai" />); open()
    fireEvent.click(screen.getByRole('button', { name: '当前时间' }))
    expect(selectedValue('时')).toBe('02')
    expect(milliseconds().value).toBe('904')
    fireEvent.keyDown(wheel('秒'), { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('button', { name: /应用时间/ }))
    expect(input().value).toBe('2026-09-13 02:47:09.904')
  })

  it('opens from the keyboard, applies with Enter, and restores focus and scrolling', () => {
    render(<Harness />)
    const overflow = document.documentElement.style.overflow
    fireEvent.keyDown(input(), { key: 'ArrowDown', altKey: true })
    expect(document.documentElement.style.overflow).toBe('hidden')
    scrollTo('秒', 59)
    fireEvent.keyDown(wheel('秒'), { key: 'ArrowDown' })
    expect(selectedValue('秒')).toBe('59')
    fireEvent.keyDown(wheel('秒'), { key: 'Enter' })
    expect(input().value).toBe('2026-09-12 14:47:59.904')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '选择日期与时间' }))
    expect(document.documentElement.style.overflow).toBe(overflow)
  })

  it('validates millisecond text, pads on blur, and applies with Enter', () => {
    render(<Harness />); open()
    fireEvent.change(milliseconds(), { target: { value: '' } })
    expect(screen.getByRole('alert').textContent).toContain('0–999')
    expect((screen.getByRole('button', { name: /应用时间/ }) as HTMLButtonElement).disabled).toBe(true)
    for (const value of ['-1', '1000', '1.5', '1e2', 'abc']) {
      fireEvent.change(milliseconds(), { target: { value } })
      expect(milliseconds().value).toBe('')
    }
    fireEvent.change(milliseconds(), { target: { value: '7' } })
    fireEvent.blur(milliseconds())
    expect(milliseconds().value).toBe('007')
    fireEvent.keyDown(milliseconds(), { key: 'Enter' })
    expect(input().value).toBe('2026-09-12 14:47:08.007')
  })

  it('keeps editable milliseconds on cancellation and resets them with zero time', () => {
    render(<Harness />); open()
    fireEvent.change(milliseconds(), { target: { value: '999' } })
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    open()
    expect(milliseconds().value).toBe('904')
    fireEvent.click(screen.getByRole('button', { name: '零点' }))
    expect(milliseconds().value).toBe('000')
    fireEvent.click(screen.getByRole('button', { name: /应用时间/ }))
    expect(input().value).toBe('2026-09-12 00:00:00.000')
  })

  it('supports a read-only seconds-only variant for world-time planning', () => {
    render(<Harness initial="2026-09-12T14:47:08" precision="seconds" readOnly />)
    expect(input().readOnly).toBe(true)
    fireEvent.click(input())
    expect(screen.getAllByRole('listbox')).toHaveLength(3)
    expect(screen.queryByRole('textbox', { name: '输入毫秒' })).toBeNull()
    scrollTo('秒', 19)
    fireEvent.click(screen.getByRole('button', { name: /应用时间/ }))
    expect(input().value).toBe('2026-09-12 14:47:19')
  })
})
