// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolDescriptor } from '../types/tool'
import { Icon, ToolIcon } from './Icon'

afterEach(cleanup)

const tool: ToolDescriptor = {
  slug: 'temporary-chat', displayName: '临时会话', description: '', categoryCode: 'other',
  iconKey: 'chat', routePath: '/tools/temporary-chat', executionMode: 'HYBRID', frontendKey: null,
}

describe('shared icons', () => {
  it('has an explicit square box and stays out of the accessibility tree', () => {
    const { container, getByRole } = render(<button><Icon name="plus" size={24} />创建会话</button>)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('24')
    expect(svg.getAttribute('height')).toBe('24')
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('focusable')).toBe('false')
    expect(getByRole('button', { name: '创建会话' })).toBeTruthy()
  })

  it('keeps the same drawing when the tool name or displayed size changes', () => {
    const { container, rerender } = render(<ToolIcon tool={tool} size={18} />)
    const path = container.querySelector('path')!.getAttribute('d')
    rerender(<ToolIcon tool={{ ...tool, displayName: 'Temporary chat' }} size={24} />)
    expect(container.querySelector('path')!.getAttribute('d')).toBe(path)
  })

  it('uses a real fallback drawing for unknown catalog icons including prototype names', () => {
    const { container } = render(<ToolIcon tool={{ ...tool, slug: 'constructor', iconKey: '__proto__' }} />)
    expect(container.querySelector('path')!.getAttribute('d')).toBeTruthy()
  })
})
