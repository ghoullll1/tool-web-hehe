// @vitest-environment jsdom
import { StrictMode } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DarkVeil from './DarkVeil'
import { installCanvasFeedback } from './canvasFeedback'

const gpu = vi.hoisted(() => ({ render: vi.fn(), geometryRemove: vi.fn(), programRemove: vi.fn(), lose: vi.fn(), linked: true, canvases: [] as HTMLCanvasElement[] }))
vi.mock('ogl', () => ({
  Renderer: class {
    gl = { getProgramParameter: () => gpu.linked, LINK_STATUS: 1, drawingBufferWidth: 500, drawingBufferHeight: 300, getExtension: () => ({ loseContext: gpu.lose }) }
    constructor({ canvas }: { canvas: HTMLCanvasElement }) { gpu.canvases.push(canvas) }
    setSize() {}
    render = gpu.render
  },
  Program: class {
    program = {}
    uniforms: Record<string, { value: unknown }>
    constructor(_gl: unknown, options: { uniforms: Record<string, { value: unknown }> }) { this.uniforms = options.uniforms }
    remove = gpu.programRemove
  },
  Triangle: class { remove = gpu.geometryRemove },
  Mesh: class {},
  Vec2: class { set() {} },
}))
let frames: Map<number, FrameRequestCallback>
let next: number
let intersect: IntersectionObserverCallback
let disconnect: ReturnType<typeof vi.fn>
beforeEach(() => {
  frames = new Map(); next = 0; gpu.linked = true; gpu.canvases = []
  vi.clearAllMocks()
  disconnect = vi.fn()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++next, callback); return next })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id) })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect = disconnect })
  vi.stubGlobal('IntersectionObserver', class { constructor(fn: IntersectionObserverCallback) { intersect = fn } observe() {} disconnect = disconnect })
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = '' })
function tick(now = performance.now() + 600) { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(now)) }

describe('decorative resource lifecycle', () => {
  it('uses fresh canvases during StrictMode replay and releases GPU/RAF resources', () => {
    const view = render(<StrictMode><DarkVeil /></StrictMode>)
    expect(gpu.canvases).toHaveLength(2)
    expect(gpu.canvases[0]).not.toBe(gpu.canvases[1])
    expect(view.container.querySelectorAll('canvas')).toHaveLength(1)
    tick()
    expect(gpu.render).toHaveBeenCalled()
    view.unmount()
    expect(frames.size).toBe(0)
    expect(gpu.lose).toHaveBeenCalledTimes(2)
    expect(gpu.geometryRemove).toHaveBeenCalledTimes(2)
    expect(gpu.programRemove).toHaveBeenCalledTimes(2)
  })
  it('falls back without throwing when the decorative shader cannot link', () => {
    gpu.linked = false
    const view = render(<DarkVeil />)
    expect(view.container.querySelector('canvas')).toBeNull()
    expect(frames.size).toBe(0)
    expect(gpu.lose).toHaveBeenCalledTimes(1)
  })
  it('pauses off-screen and when the document is hidden; resumes only when visible', () => {
    render(<DarkVeil />)
    intersect([{ isIntersecting: false }] as IntersectionObserverEntry[], {} as IntersectionObserver)
    expect(frames.size).toBe(0)
    intersect([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver)
    expect(frames.size).toBe(1)
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(frames.size).toBe(0)
  })
  it('handles asynchronous WebGL render failure without affecting the application', () => {
    gpu.render.mockImplementationOnce(() => { throw new Error('context lost') })
    render(<DarkVeil />)
    expect(() => tick()).not.toThrow()
    expect(frames.size).toBe(0)
    expect(gpu.lose).toHaveBeenCalledTimes(1)
  })
  it('does not run ClickSpark while idle or outside the workbench; gives scoped controls finite feedback', () => {
    const ctx = { setTransform: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn() }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
    const canvas = document.createElement('canvas')
    const button = document.createElement('button')
    document.body.append(button)
    const stop = installCanvasFeedback(canvas)
    expect(frames.size).toBe(0)
    button.click()
    expect(frames.size).toBe(0)
    const workbench = document.createElement('section')
    workbench.className = 'workbench'
    document.body.append(workbench)
    workbench.append(button)
    button.disabled = true; button.click()
    expect(frames.size).toBe(0)
    button.disabled = false; button.click()
    expect(frames.size).toBe(1)
    tick()
    expect(frames.size).toBe(0)
    button.click(); stop()
    expect(frames.size).toBe(0)
  })
})
