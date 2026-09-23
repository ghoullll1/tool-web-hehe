// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AmbientField from './AmbientField'
import { ambientMotif } from '../ambientMotifs'

const gpu = vi.hoisted(() => ({
  render: vi.fn(), geometryRemove: vi.fn(), programRemove: vi.fn(), lose: vi.fn(),
  setSize: vi.fn(), created: vi.fn(), dpr: 1, unavailable: false, linked: true,
}))
vi.mock('ogl', () => ({
  Renderer: class {
    set dpr(value: number) { gpu.dpr = value }
    get dpr() { return gpu.dpr }
    gl = { ONE: 1, ONE_MINUS_SRC_ALPHA: 2, LINK_STATUS: 3, drawingBufferWidth: 1600, drawingBufferHeight: 960,
      clearColor: vi.fn(), getProgramParameter: () => gpu.linked, getExtension: () => ({ loseContext: gpu.lose }) }
    constructor() { gpu.created(); if (gpu.unavailable) throw new Error('No WebGL') }
    setSize = gpu.setSize; render = gpu.render
  },
  Triangle: class { remove = gpu.geometryRemove },
  Program: class { program = {}; remove = gpu.programRemove; setBlendFunc = vi.fn() },
  Mesh: class {},
}))
let frames: Map<number, FrameRequestCallback>, next = 0
let visibility: IntersectionObserverCallback
const disconnect = vi.fn()
beforeEach(() => {
  vi.clearAllMocks(); frames = new Map(); next = 0; gpu.unavailable = false; gpu.linked = true
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 5000, height: 3000, left: 0, top: 0, right: 5000, bottom: 3000, x: 0, y: 0, toJSON() {} })
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++next, callback); return next })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect = disconnect })
  vi.stubGlobal('IntersectionObserver', class { constructor(callback: IntersectionObserverCallback) { visibility = callback } observe() {} disconnect = disconnect })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const ready = () => waitFor(() => expect(document.querySelector('canvas')?.getAttribute('data-ready')).toBe('true'))
function tick(now: number) { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(now)) }

it('renders the upstream shader with one loop throttled to 30 FPS', async () => {
  render(<AmbientField motif={ambientMotif('json-formatter')} />)
  await ready()
  expect(gpu.render).toHaveBeenCalledTimes(1)
  expect(gpu.dpr * 5000).toBeLessThanOrEqual(1600)
  expect(gpu.dpr).toBeLessThanOrEqual(1.5)
  const start = performance.now()
  tick(start + 40); expect(gpu.render).toHaveBeenCalledTimes(2)
  tick(start + 45); expect(gpu.render).toHaveBeenCalledTimes(2)
  expect(frames.size).toBe(1)
})
it('pauses offscreen and hidden tabs without leaving a RAF loop running', async () => {
  render(<AmbientField motif={ambientMotif('coordinate')} />); await ready()
  visibility([{ isIntersecting: false }] as IntersectionObserverEntry[], {} as IntersectionObserver)
  expect(frames.size).toBe(0)
  visibility([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver)
  expect(frames.size).toBe(1)
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  document.dispatchEvent(new Event('visibilitychange')); expect(frames.size).toBe(0)
})
it('disposes GPU resources on route changes, unmount and StrictMode replay', async () => {
  const view = render(<StrictMode><AmbientField motif={ambientMotif('json-formatter')} /></StrictMode>)
  await ready()
  view.rerender(<StrictMode><AmbientField motif={ambientMotif('world-time')} /></StrictMode>)
  await ready()
  expect(frames.size).toBe(1); expect(document.querySelectorAll('canvas')).toHaveLength(1)
  expect(gpu.lose).toHaveBeenCalledTimes(1)
  view.unmount()
  expect(frames.size).toBe(0); expect(gpu.lose).toHaveBeenCalledTimes(2)
  expect(gpu.geometryRemove).toHaveBeenCalledTimes(2); expect(gpu.programRemove).toHaveBeenCalledTimes(2)
})
it.each(['unavailable', 'link failure', 'context lost'])('keeps fallback usable after %s', async failure => {
  gpu.unavailable = failure === 'unavailable'; gpu.linked = failure !== 'link failure'
  const view = render(<AmbientField motif={ambientMotif('json-formatter')} />)
  if (failure === 'context lost') {
    await ready(); view.container.querySelector('canvas')!.dispatchEvent(new Event('webglcontextlost'))
  }
  await waitFor(() => expect(gpu.created).toHaveBeenCalled())
  await waitFor(() => expect(view.container.querySelector('canvas')).toBeNull())
  expect(frames.size).toBe(0)
})
it('does not start a late-loaded shader after unmount', async () => {
  const view = render(<AmbientField motif={ambientMotif('json-formatter')} />)
  view.unmount(); await Promise.resolve()
  expect(gpu.render).not.toHaveBeenCalled(); expect(frames.size).toBe(0)
})
