/** Legacy CSS bridge: emits only scoped color overrides; never changes classic CSS or layout.
 * Run `node scripts/ui-palette.mjs --patch src/styles.css` to print an apply_patch update.
 * New UI should use semantic tokens directly. This bridge covers existing lazy-loaded tools.
 */
import fs from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'

const scope = 'html[data-ui="modern"]'
const token = (name) => `var(--night-${name})`
export function roleFor(prop) {
  if (/shadow/.test(prop)) return 'shadow'
  if (/border|outline|scrollbar|stroke/.test(prop)) return 'border'
  if (/background/.test(prop)) return 'surface'
  if (prop.startsWith('--')) {
    if (/line|border/.test(prop)) return 'border'
    if (/ink|text|muted/.test(prop)) return 'text'
    return 'surface'
  }
  return 'text'
}

export function mapColor(color, role) {
  let channels
  if (color.startsWith('#')) {
    let hex = color.slice(1)
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map(x => x + x).join('')
    channels = [0, 2, 4].map(start => parseInt(hex.slice(start, start + 2), 16))
    if (hex.length === 8) channels.push(parseInt(hex.slice(6), 16) / 255)
  } else if (/^rgba?\(/i.test(color)) {
    channels = color.match(/[\d.]+/g).map(Number)
  } else channels = color.toLowerCase() === 'white' ? [255, 255, 255] : [0, 0, 0]
  const [r, g, b, alpha] = channels
  const high = Math.max(r, g, b), low = Math.min(r, g, b)
  const light = (high + low) / 510
  const chroma = high - low
  const hue = chroma < 20 ? 'neutral' : r > g * 1.2 && r > b * 1.15 ? 'red' : b > r * 1.18 && b > g * 1.06 ? 'blue' : r > b * 1.35 && g > b * 1.25 && r > g * 1.06 ? 'amber' : 'green'
  let result
  if (role === 'shadow') return `rgba(0, 0, 0, ${alpha ?? 0.3})`
  if (role === 'border') result = token(hue === 'red' ? 'danger-line' : light < .55 && chroma > 35 ? 'line-active' : 'line')
  else if (role === 'text') result = token(hue === 'red' ? 'danger' : hue === 'blue' ? 'blue' : hue === 'amber' ? 'amber' : chroma > 60 && light > .22 ? 'accent' : light > .82 || light < .3 ? 'text' : 'muted')
  else result = token(hue === 'red' ? 'danger-surface' : hue === 'amber' ? 'warning-surface' : light > .9 ? 'panel' : light > .73 ? 'raised' : light > .56 && chroma > 90 ? 'accent' : light < .32 ? 'solid' : 'selected')
  return alpha != null && alpha < 1 ? `color-mix(in srgb, ${result} ${Math.round(alpha * 100)}%, transparent)` : result
}

export function themeValue(value, prop) {
  const role = roleFor(prop)
  let themed = value.replace(/#[\da-f]{3,8}\b|rgba?\([\d.,\s]+\)|\b(?:white|black)\b/gi, color => mapColor(color, role))
  // Legacy deep/green variables serve both text and solid backgrounds. Split those roles.
  if (role === 'text') themed = themed.replace(/var\(--(?:[\w]+-)*(?:deep|green)(?:-[\w]+)?\)/g, token('accent'))
  return themed
}

export function generate(source, filename) {
  const root = postcss.parse(source, { from: filename })
  root.walkAtRules(rule => { if (/keyframes|font-face|import/.test(rule.name)) rule.remove() })
  root.walkComments(comment => comment.remove())
  root.walkDecls(decl => {
    if (decl.prop === 'font-size' || decl.prop === 'font') {
      decl.value = decl.value.replace(/\b(\d+(?:\.\d+)?)px\b/g, (match, size) => Number(size) < 14 ? '14px' : match)
      return
    }
    if (!/^(?:--[\w-]+|color|background(?:-color|-image)?|border(?:-(?:top|bottom|left|right))?(?:-color)?|outline(?:-color)?|(?:box|text)-shadow|fill|stroke|caret-color|accent-color|scrollbar-color)$/.test(decl.prop)) { decl.remove(); return }
    const next = themeValue(decl.value, decl.prop)
    // Keep transparent/inherit/var and border resets: omitting these changes the original cascade.
    if (next === decl.value && decl.prop.startsWith('--')) decl.remove()
    else decl.value = next
  })
  root.walkRules(rule => {
    if (!rule.nodes.length) { rule.remove(); return }
    rule.selectors = rule.selectors.map(selector => selector.trim() === ':root' ? scope : `${scope} ${selector}`)
  })
  root.walkAtRules(rule => { if (!rule.nodes?.length) rule.remove() })
  return `/* Generated color bridge for ${filename}. See scripts/ui-palette.mjs. */\n${root.toString().trim()}\n`
}

export function sourceFiles(directory = 'src') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(item => {
    const filename = path.join(directory, item.name).replaceAll('\\', '/')
    return item.isDirectory() ? item.name === 'appearance' ? [] : sourceFiles(filename) : item.name.endsWith('.css') ? [filename] : []
  })
}

if (process.argv[2] === '--write' || process.argv[2] === '--check') {
  for (const input of sourceFiles()) {
    const output = `src/appearance/palette/${path.basename(input)}`
    const content = generate(fs.readFileSync(input, 'utf8'), input)
    if (process.argv[2] === '--write') {
      fs.mkdirSync(path.dirname(output), { recursive: true })
      fs.writeFileSync(output, content)
    } else if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8').replaceAll('\r\n', '\n') !== content.replaceAll('\r\n', '\n')) {
      console.error(`UI palette is stale: ${input}. Run npm run ui:palette.`)
      process.exitCode = 1
    }
  }
}

if (process.argv[2] === '--patch') {
  const input = process.argv[3]
  const output = `src/appearance/palette/${path.basename(input)}`
  const content = generate(fs.readFileSync(input, 'utf8'), input)
  const existing = fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : null
  if (existing === content) process.exit(0)
  const body = existing == null ? `*** Add File: ${output}\n${content.trimEnd().split('\n').map(line => '+' + line).join('\n')}` : `*** Update File: ${output}\n@@\n${existing.trimEnd().split('\n').map(line => '-' + line).join('\n')}\n${content.trimEnd().split('\n').map(line => '+' + line).join('\n')}`
  process.stdout.write(`*** Begin Patch\n${body}\n*** End Patch\n`)
}
