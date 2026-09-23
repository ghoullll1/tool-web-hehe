// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installSelectionEffects } from './selectionEffects'

const motion = vi.hoisted(() => ({ animate: vi.fn(), stop: vi.fn() }))
vi.mock('motion', () => ({ animate: motion.animate }))
let frames: Map<number, FrameRequestCallback>
let next = 0
let stop: (() => void) | undefined
function flush() { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(100)) }
beforeEach(() => {
  frames = new Map(); next = 0
  vi.clearAllMocks()
  motion.animate.mockReturnValue({ stop: motion.stop, then: vi.fn() })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++next, callback); return next })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const left = this.textContent === '第二项' ? 90 : 0
    return { left, top: 0, width: 80, height: 40, right: left + 80, bottom: 40, x: left, y: 0, toJSON() {} }
  })
})
afterEach(() => { stop?.(); stop = undefined; document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('shared selection transitions', () => {
  it('keeps pinned home and scrolling tool selection plates independent', async () => {
    document.body.innerHTML = '<nav class="navigation"><div class="navigation-home"><a aria-current="page">控制台</a></div><div class="navigation-tools"><section class="nav-group"><a>工具</a></section></div></nav>'
    stop = installSelectionEffects(); flush()
    const home = document.querySelector('.navigation-home a')!
    const tool = document.querySelector('.navigation-tools a')!
    const homeGlow = document.querySelector('.navigation-home > .nebula-selection-glow') as HTMLElement
    const toolGlow = document.querySelector('.navigation-tools > .nebula-selection-glow') as HTMLElement
    expect(document.querySelector('.navigation > .nebula-selection-glow')).toBeNull()
    expect(homeGlow.style.opacity).toBe('1')
    expect(toolGlow.style.opacity).toBe('0')
    home.removeAttribute('aria-current'); tool.setAttribute('aria-current', 'page')
    await Promise.resolve(); flush()
    expect(homeGlow.style.opacity).toBe('0')
    expect(toolGlow.style.opacity).toBe('1')
  })

  it('hides the navigation plate when its active category collapses and restores it on reopening', async () => {
    document.body.innerHTML = '<nav class="navigation"><div class="navigation-tools"><section class="nav-group"><a aria-current="page">工具</a></section></div></nav>'
    stop = installSelectionEffects(); flush()
    const group = document.querySelector('.nav-group')!
    const glow = document.querySelector('.nebula-selection-glow') as HTMLElement
    expect(glow.style.opacity).toBe('1')
    group.classList.add('is-collapsed'); await Promise.resolve(); flush()
    expect(glow.style.opacity).toBe('0')
    group.classList.remove('is-collapsed'); await Promise.resolve(); flush()
    expect(glow.style.opacity).toBe('1')
  })
  it('discovers lazy-loaded tool groups and removes detached route decorations', async () => {
    stop = installSelectionEffects(); flush()
    const group = document.createElement('div')
    group.className = 'json-view-switch'
    group.innerHTML = '<button aria-pressed="true">第一项</button>'
    document.body.append(group)
    await Promise.resolve(); flush()
    expect(group.querySelector('.nebula-selection-glow')).not.toBeNull()
    group.remove()
    await Promise.resolve(); flush()
    expect(group.querySelector('.nebula-selection-glow')).toBeNull()
    expect(motion.stop).toHaveBeenCalled()
  })
  it.each(['ts-tabs', 'json-view-switch', 'api-tabs', 'hash-mode-switch', 'port-category-rail', 'coordinate-mode-switch', 'world-time-mode'])('connects %s without replacing native buttons', async className => {
    document.body.innerHTML = `<div class="${className}"><button aria-pressed="true">第一项</button><button aria-pressed="false">第二项</button></div>`
    const buttons = document.querySelectorAll('button')
    stop = installSelectionEffects(); flush()
    expect(document.querySelectorAll('.nebula-selection-glow')).toHaveLength(1)
    buttons[0]!.setAttribute('aria-pressed', 'false'); buttons[1]!.setAttribute('aria-pressed', 'true')
    await Promise.resolve(); flush()
    expect(document.querySelectorAll('button')[1]).toBe(buttons[1])
    expect(motion.animate).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ x: 90 }), expect.objectContaining({ duration: 0.36 }))
    stop(); stop = undefined
    expect(document.querySelector('.nebula-selection-glow')).toBeNull()
    expect(document.querySelector('[data-nebula-group]')).toBeNull()
    expect(frames.size).toBe(0)
  })
  it.each(['coordinate-segmented', 'sql-setting-group'])('owns the inner buttons of %s without painting over the label', className => {
    document.body.innerHTML = `<div class="${className}"><span>标签</span><div><button aria-pressed="true">第一项</button><button>第二项</button></div></div>`
    stop = installSelectionEffects(); flush()
    const group = document.querySelector('[data-nebula-group]')!
    expect(group.parentElement?.className).toBe(className)
    expect(group.querySelector(':scope > button')?.textContent).toBe('第一项')
    expect(group.querySelector('.nebula-selection-glow')?.getAttribute('aria-hidden')).toBe('true')
  })
  it('restores a selected plate after the group temporarily has no selection', async () => {
    document.body.innerHTML = '<div class="ts-tabs"><button aria-pressed="true">第一项</button></div>'
    stop = installSelectionEffects(); flush()
    const button = document.querySelector('button')!
    button.setAttribute('aria-pressed', 'false'); await Promise.resolve(); flush()
    expect((document.querySelector('.nebula-selection-glow') as HTMLElement).style.opacity).toBe('0')
    button.setAttribute('aria-pressed', 'true'); await Promise.resolve(); flush()
    expect((document.querySelector('.nebula-selection-glow') as HTMLElement).style.opacity).toBe('1')
  })
})
