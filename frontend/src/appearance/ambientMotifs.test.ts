import { describe, expect, it } from 'vitest'
import { ambientMotif, ambientMotifs } from './ambientMotifs'
import { studioProfiles } from './studioProfiles'
import { backgroundUniforms } from './effects/backgrounds/uniforms'

describe('official React Bits background assignments', () => {
  it('covers every presentation profile without supplying a fallback tool catalog', () => {
    expect(Object.keys(ambientMotifs).sort()).toEqual(Object.keys(studioProfiles).sort())
    expect(new Set(Object.values(ambientMotifs).map(p => p.effect)).size).toBe(6)
    expect(new Set(Object.values(ambientMotifs).map(p => JSON.stringify(p))).size).toBe(19)
    expect(ambientMotif('future-tool').effect).toBe('Threads')
  })
  it.each(Object.entries(ambientMotifs))('%s has valid palette and upstream uniforms', (_, preset) => {
    preset.colors.forEach(color => expect(color).toMatch(/^#[0-9a-f]{6}$/i))
    expect(preset.speed).toBeGreaterThan(0)
    expect(preset.speed).toBeLessThan(.6)
    const uniforms = backgroundUniforms(preset)
    expect(uniforms.uTime?.value).toBe(0)
    expect(uniforms.iTime?.value).toBe(0)
    expect(JSON.stringify(uniforms)).not.toMatch(/null/)
  })
})
