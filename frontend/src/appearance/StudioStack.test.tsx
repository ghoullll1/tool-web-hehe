// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it } from 'vitest'
import { StudioStack } from './StudioStack'
import type { ToolDescriptor } from '../types/tool'

afterEach(cleanup)
const tools: ToolDescriptor[] = ['one','two'].map(slug => ({ slug, displayName: slug, description: '工具说明', categoryCode: 'developer', iconKey: 'json', routePath: `/tools/${slug}`, executionMode: 'CLIENT', frontendKey: slug }))
it('shows API tools and cycles through them using accessible controls', () => {
  render(<MemoryRouter><StudioStack tools={tools} /></MemoryRouter>)
  expect(screen.getByRole('link', { name: /打开这个工具/ }).getAttribute('href')).toBe('/tools/one')
  fireEvent.click(screen.getByRole('button', { name: '下一个推荐工具' }))
  expect(screen.getByRole('heading', { name: 'two' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '下一个推荐工具' }))
  expect(screen.getByRole('heading', { name: 'one' })).toBeTruthy()
})
it('never substitutes a demo catalog for an empty response', () => {
  const view = render(<MemoryRouter><StudioStack tools={[]} /></MemoryRouter>)
  expect(view.container.textContent).toBe('')
})
it('handles a shrinking API catalog after navigating the stack', () => {
  const view = render(<MemoryRouter><StudioStack tools={tools} /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: '下一个推荐工具' }))
  view.rerender(<MemoryRouter><StudioStack tools={tools.slice(0,1)} /></MemoryRouter>)
  expect(screen.getByRole('heading', { name: 'one' })).toBeTruthy()
})
