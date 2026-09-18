import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function copyDirectory(source, destination) {
  mkdirSync(destination, { recursive: true })
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name)
    const to = join(destination, entry.name)
    if (entry.isDirectory()) copyDirectory(from, to)
    else if (!existsSync(to) || statSync(from).size !== statSync(to).size) copyFileSync(from, to)
  }
}

for (const folder of ['cmaps', 'standard_fonts', 'wasm']) {
  copyDirectory(`node_modules/pdfjs-dist/${folder}`, `public/pdfjs/${folder}`)
}
