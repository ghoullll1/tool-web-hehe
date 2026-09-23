// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AmbientBackdrop } from './AmbientBackdrop'

const preference = vi.hoisted(() => ({ edition: 'modern', effectiveMotion: 'full' }))
vi.mock('./AppearanceContext', () => ({ useAppearance: () => preference }))
vi.mock('./effects/AmbientField', () => ({ default: () => <canvas data-testid="ambient-field" /> }))
afterEach(() => { cleanup(); preference.edition = 'modern'; preference.effectiveMotion = 'full' })

it('unmounts animated decoration for lightweight/off and removes the layer for classic', async () => {
  const view = render(<AmbientBackdrop tone="blue" />)
  await screen.findByTestId('ambient-field')
  for (const motion of ['lite', 'off']) {
    preference.effectiveMotion = motion
    view.rerender(<AmbientBackdrop tone="blue" />)
    expect(view.container.querySelector('canvas')).toBeNull()
    expect(view.container.querySelector('.studio-ambient')?.getAttribute('aria-hidden')).toBe('true')
  }
  preference.edition = 'classic'
  view.rerender(<AmbientBackdrop tone="blue" />)
  expect(view.container.firstChild).toBeNull()
})

it('keeps route-specific static palettes when motion is off', () => {
  preference.effectiveMotion = 'off'
  const view = render(<AmbientBackdrop tone="blue" slug="coordinate" />)
  const coordinates = view.container.querySelector('.studio-ambient')!.getAttribute('style')
  expect(view.container.querySelector('[data-effect="RippleGrid"]')).not.toBeNull()
  view.rerender(<AmbientBackdrop tone="blue" slug="json-formatter" />)
  expect(view.container.querySelector('[data-effect="Threads"]')).not.toBeNull()
  expect(view.container.querySelector('.studio-ambient')!.getAttribute('style')).not.toBe(coordinates)
  expect(view.container.querySelector('canvas')).toBeNull()
})
