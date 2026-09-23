import { describe, expect, it } from 'vitest'
import { generate, mapColor, themeValue } from './ui-palette.mjs'
import fs from 'node:fs'
import path from 'node:path'

describe('isolated modern color bridge', () => {
  it('preserves transparent, inherited, border-reset and font cascade declarations', () => {
    const css = generate('.sample {background:#fff;color:#123;font-size:12px;border:1px solid #fff}.sample {background:transparent;color:inherit;border:0;font-size:16px}', 'example.css')
    expect(css).toContain('background:transparent')
    expect(css).toContain('color:inherit')
    expect(css).toContain('border:0')
    expect(css).toContain('font-size:14px')
    expect(css).toContain('font-size:16px')
    expect(css.match(/html\[data-ui="modern"\]/g)).toHaveLength(2)
  })
  it('keeps media queries and removes geometry and animation definitions', () => {
    const css = generate('@media(max-width:700px){.one,.two{padding:4px;color:#fff}}@keyframes spin{to{color:#fff}}', 'example.css')
    expect(css).toContain('@media(max-width:700px)')
    expect(css).toContain('html[data-ui="modern"] .two')
    expect(css).not.toContain('padding')
    expect(css).not.toContain('@keyframes')
  })
  it('separates text/background roles and retains alpha and error semantics', () => {
    expect(mapColor('#fff', 'surface')).toBe('var(--night-panel)')
    expect(mapColor('#fff', 'text')).toBe('var(--night-text)')
    expect(mapColor('#b12525', 'text')).toBe('var(--night-danger)')
    expect(mapColor('rgba(255,255,255,.5)', 'surface')).toContain('50%')
    expect(themeValue('var(--data-deep)', 'color')).toBe('var(--night-accent)')
    expect(themeValue('var(--data-deep)', 'background')).toBe('var(--data-deep)')
  })
  it('keeps checked-in adapters synchronized with all existing component CSS', () => {
    function visit(directory) {
      return fs.readdirSync(directory, { withFileTypes:true }).flatMap(item => item.isDirectory() ? item.name === 'appearance' ? [] : visit(path.join(directory,item.name)) : item.name.endsWith('.css') ? [path.join(directory,item.name)] : [])
    }
    for (const input of visit('src')) {
      const normalized = input.replaceAll('\\','/')
      const output = `src/appearance/palette/${path.basename(input)}`
      expect(fs.readFileSync(output,'utf8').replaceAll('\r\n','\n'), output).toBe(generate(fs.readFileSync(input,'utf8'), normalized).replaceAll('\r\n','\n'))
    }
  })
})
