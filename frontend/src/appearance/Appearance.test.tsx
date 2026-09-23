// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppearanceProvider } from './AppearanceProvider'
import { AppearanceSwitch } from './AppearanceSwitch'
import { APPEARANCE_KEY, LEGACY_APPEARANCE_KEY } from './AppearanceContext'
import { SpotlightLink } from './SpotlightLink'

let changeMotion: (() => void) | undefined
let matches = false
let coarse = false
const removeListener = vi.fn()
beforeEach(() => {
  localStorage.clear()
  matches = false
  coarse = false
  vi.stubGlobal('matchMedia', (query: string) => ({ get matches() { return query.includes('reduced-motion') ? matches : coarse }, addEventListener: (_: string, fn: () => void) => { if (query.includes('reduced-motion')) changeMotion = fn }, removeEventListener: removeListener }))
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function Fixture({ onUnmount = () => {} }: { onUnmount?: () => void }) {
  const [text, setText] = useState('')
  const [file, setFile] = useState<File>()
  useEffect(() => () => onUnmount(), [onUnmount])
  return <><input aria-label="测试输入" value={text} onChange={event => setText(event.target.value)} /><input type="file" aria-label="测试文件" onChange={event => setFile(event.target.files?.[0])} /><output>{file?.name}</output></>
}
function mount(child = <Fixture />) {
  return render(<MemoryRouter><AppearanceProvider><AppearanceSwitch />{child}<SpotlightLink to="/tools/hash">哈希</SpotlightLink></AppearanceProvider></MemoryRouter>)
}

describe('appearance editions', () => {
  it('defaults to modern and persists an explicit classic choice', () => {
    const rendered = mount()
    expect(document.documentElement.dataset.ui).toBe('modern')
    expect(screen.getByRole('group', { name: '界面风格' }).querySelectorAll('button')[0]?.textContent).toBe('现代版')
    fireEvent.click(screen.getByRole('button', { name: '经典版' }))
    expect(JSON.parse(localStorage.getItem(APPEARANCE_KEY)!)).toEqual({ edition: 'classic', motion: 'full' })
    rendered.unmount()
    mount()
    expect(document.documentElement.dataset.ui).toBe('classic')
  })
  it('switches without replacing inputs, file state or lifecycle', () => {
    const ended = vi.fn()
    mount(<Fixture onUnmount={ended} />)
    const input = screen.getByLabelText('测试输入')
    const upload = screen.getByLabelText('测试文件')
    const file = new File(['data'], 'example.yml', { type: 'text/plain' })
    fireEvent.change(input, { target: { value: 'server: 8090' } })
    fireEvent.change(upload, { target: { files: [file] } })
    for (const edition of ['现代版', '经典版', '现代版']) fireEvent.click(screen.getByRole('button', { name: edition }))
    expect(screen.getByLabelText('测试输入')).toBe(input)
    expect(input).toHaveProperty('value', 'server: 8090')
    expect(screen.getByLabelText('测试文件')).toBe(upload)
    expect(screen.getByText('example.yml')).toBeTruthy()
    expect(ended).not.toHaveBeenCalled()
  })
  it('handles invalid and blocked storage safely', () => {
    localStorage.setItem(APPEARANCE_KEY, '{broken')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    mount()
    expect(document.documentElement.dataset.ui).toBe('modern')
    fireEvent.click(screen.getByRole('button', { name: '经典版' }))
    expect(document.documentElement.dataset.ui).toBe('classic')
  })
  it('disables pointer effects with user or live system reduced motion', () => {
    mount()
    const link = screen.getByRole('link', { name: '哈希' })
    expect(link.classList.contains('bits-spotlight')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '动效：完整' }))
    expect(document.documentElement.dataset.motion).toBe('lite')
    fireEvent.click(screen.getByRole('button', { name: '动效：轻量' }))
    expect(document.documentElement.dataset.motion).toBe('reduced')
    expect(link.classList.contains('bits-spotlight')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '动效：关闭' }))
    act(() => { matches = true; changeMotion?.() })
    expect(screen.getByRole('button', { name: '动效：跟随系统' })).toBeTruthy()
    expect(link.classList.contains('bits-spotlight')).toBe(false)
    act(() => { matches = false; changeMotion?.() })
    expect(link.classList.contains('bits-spotlight')).toBe(true)
  })
  it('migrates v1 once, respects motion opt-out and does not overwrite subsequent choices', () => {
    localStorage.setItem(LEGACY_APPEARANCE_KEY, JSON.stringify({ edition: 'classic', motion: false }))
    const rendered = mount()
    expect(document.documentElement.dataset.ui).toBe('modern')
    expect(document.documentElement.dataset.motion).toBe('reduced')
    fireEvent.click(screen.getByRole('button', { name: '经典版' }))
    rendered.unmount()
    mount()
    expect(document.documentElement.dataset.ui).toBe('classic')
  })
  it('uses lightweight effects on small or coarse-pointer devices without losing the saved preference', () => {
    coarse = true
    mount()
    expect(document.documentElement.dataset.motion).toBe('lite')
    expect(JSON.parse(localStorage.getItem(APPEARANCE_KEY)!)).toEqual({ edition: 'modern', motion: 'full' })
  })
  it('cleans up document attributes and media listener on unmount', () => {
    const rendered = mount()
    rendered.unmount()
    expect(document.documentElement.hasAttribute('data-ui')).toBe(false)
    expect(removeListener).toHaveBeenCalled()
  })
})
