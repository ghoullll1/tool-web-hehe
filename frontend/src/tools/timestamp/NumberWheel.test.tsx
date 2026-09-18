// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import NumberWheel from './NumberWheel'

afterEach(cleanup)

const captureMethods = ['setPointerCapture', 'hasPointerCapture', 'releasePointerCapture'] as const
const originalCaptureMethods = captureMethods.map((name) => Object.getOwnPropertyDescriptor(HTMLElement.prototype, name))
const captures = new WeakMap<HTMLElement, number>()
beforeAll(() => {
  // jsdom lacks pointer capture and PointerEvent; emulate only their lifecycle for these tests.
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    pointerId: number
    pointerType: string
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; this.pointerType = init.pointerType ?? 'mouse' }
  })
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value(this: HTMLElement, id: number) { captures.set(this, id) } })
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', { configurable: true, value(this: HTMLElement, id: number) { return captures.get(this) === id } })
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', { configurable: true, value(this: HTMLElement) { captures.delete(this) } })
})
afterAll(() => {
  vi.unstubAllGlobals()
  captureMethods.forEach((name, index) => {
    const original = originalCaptureMethods[index]
    if (original) Object.defineProperty(HTMLElement.prototype, name, original)
    else Reflect.deleteProperty(HTMLElement.prototype, name)
  })
})

function Harness({ initial = 24, max = 59 }: { initial?: number; max?: number }) {
  const [value, setValue] = useState(initial)
  return <><NumberWheel label="秒" value={value} max={max} digits={max > 99 ? 3 : 2} onChange={setValue} /><output>{value}</output><button onClick={() => setValue(7)}>重置</button></>
}

describe('NumberWheel', () => {
  it('renders a bounded window and keeps the selected option available', () => {
    render(<Harness initial={494} max={999} />)
    expect(screen.getAllByRole('option').length).toBeLessThanOrEqual(14)
    expect(screen.getByRole('option', { name: '494' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('updates on scroll immediately rather than waiting for a delayed commit', () => {
    render(<Harness />)
    fireEvent.scroll(screen.getByRole('listbox'), { target: { scrollTop: 37 * 36 } })
    expect(screen.getByRole('status').textContent).toBe('37')
    expect(screen.getByRole('option', { name: '37' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('option', { name: '38' }))
    expect(screen.getByRole('status').textContent).toBe('38')
  })

  it('keeps keyboard values within bounds and ignores text entry', () => {
    render(<Harness />)
    const list = screen.getByRole('listbox')
    fireEvent.keyDown(list, { key: 'End' })
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(screen.getByRole('status').textContent).toBe('59')
    fireEvent.keyDown(list, { key: 'Home' })
    fireEvent.keyDown(list, { key: 'ArrowUp' })
    fireEvent.keyDown(list, { key: 'x' })
    expect(screen.getByRole('status').textContent).toBe('0')
  })

  it('aligns after external reset without losing the selected value', () => {
    render(<Harness />)
    fireEvent.scroll(screen.getByRole('listbox'), { target: { scrollTop: 40 * 36 } })
    fireEvent.click(screen.getByRole('button', { name: '重置' }))
    expect(screen.getByRole('listbox').scrollTop).toBe(7 * 36)
    expect(screen.getByRole('option', { name: '07' }).getAttribute('aria-selected')).toBe('true')
  })

  it('ignores hidden-dialog snap events until the visible wheel is aligned', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver')
    let align = () => {}
    const disconnect = vi.fn()
    Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: class {
      constructor(callback: () => void) { align = callback }
      observe() {}
      disconnect = disconnect
    } })
    try {
      const { unmount } = render(<Harness initial={50} />)
      const list = screen.getByRole('listbox')
      // Hidden dialog layout can initially snap to the first mounted option (50 - 6).
      fireEvent.scroll(list, { target: { scrollTop: 44 * 36 } })
      align()
      expect(screen.getByRole('status').textContent).toBe('50')
      Object.defineProperty(list, 'clientHeight', { configurable: true, value: 180 })
      align()
      expect(list.scrollTop).toBe(50 * 36)
      fireEvent.scroll(list, { target: { scrollTop: 51 * 36 } })
      expect(screen.getByRole('status').textContent).toBe('51')
      unmount()
      expect(disconnect).toHaveBeenCalledOnce()
    } finally {
      if (original) Object.defineProperty(globalThis, 'ResizeObserver', original)
      else Reflect.deleteProperty(globalThis, 'ResizeObserver')
    }
  })

  it('updates during mouse drag, snaps on release, and suppresses the following click', () => {
    render(<Harness />)
    const list = screen.getByRole('listbox')
    fireEvent.pointerDown(screen.getByRole('option', { name: '24' }), { pointerId: 1, button: 0, clientY: 160 })
    expect(list.hasPointerCapture(1)).toBe(true)
    fireEvent.pointerMove(list, { pointerId: 1, buttons: 1, clientY: 105 })
    expect(screen.getByRole('status').textContent).toBe('26')
    fireEvent.pointerUp(list, { pointerId: 1, clientY: 105 })
    expect(list.scrollTop).toBe(26 * 36)
    expect(list.hasPointerCapture(1)).toBe(false)
    expect(list.getAttribute('data-dragging')).toBeNull()
    fireEvent.click(screen.getByRole('option', { name: '24' }), { detail: 1 })
    expect(screen.getByRole('status').textContent).toBe('26')
    fireEvent.pointerDown(screen.getByRole('option', { name: '25' }), { pointerId: 2, button: 0, clientY: 140 })
    fireEvent.pointerUp(list, { pointerId: 2, clientY: 140 })
    expect(screen.getByRole('status').textContent).toBe('25')
  })

  it('bounds dragging in both directions and cleans up cancelled capture', () => {
    render(<Harness />)
    const list = screen.getByRole('listbox')
    fireEvent.pointerDown(list, { pointerId: 1, button: 0, clientY: 160 })
    fireEvent.pointerMove(list, { pointerId: 1, clientY: -10000 })
    expect(screen.getByRole('status').textContent).toBe('59')
    fireEvent.pointerMove(list, { pointerId: 1, clientY: 10000 })
    expect(screen.getByRole('status').textContent).toBe('0')
    fireEvent.pointerCancel(list, { pointerId: 1 })
    expect(list.hasPointerCapture(1)).toBe(false)
    expect(list.getAttribute('data-dragging')).toBeNull()
    fireEvent.pointerDown(list, { pointerId: 2, button: 0, clientY: 160 })
    fireEvent.pointerMove(list, { pointerId: 2, clientY: 124 })
    fireEvent.lostPointerCapture(list, { pointerId: 2 })
    expect(screen.getByRole('status').textContent).toBe('1')
    expect(list.getAttribute('data-dragging')).toBeNull()
  })

  it('leaves touch scrolling and non-primary mouse buttons native', () => {
    render(<Harness />)
    const list = screen.getByRole('listbox')
    fireEvent.pointerDown(list, { pointerType: 'touch', pointerId: 1, button: 0, clientY: 160 })
    fireEvent.pointerMove(list, { pointerType: 'touch', pointerId: 1, clientY: 90 })
    fireEvent.pointerDown(list, { pointerType: 'mouse', pointerId: 2, button: 2, clientY: 160 })
    fireEvent.pointerMove(list, { pointerType: 'mouse', pointerId: 2, clientY: 90 })
    expect(list.getAttribute('data-dragging')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('24')
    fireEvent.scroll(list, { target: { scrollTop: 25 * 36 } })
    expect(screen.getByRole('status').textContent).toBe('25')
  })
})
