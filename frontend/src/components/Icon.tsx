import type { CSSProperties } from 'react'
import type { ToolDescriptor } from '../types/tool'
import './icon.css'

// One 24 px drawing grid, rounded strokes and an explicit box at every size.
const paths = {
  arrowRight: 'M4 12h16m-6-6 6 6-6 6',
  arrowLeft: 'M20 12H4m6-6-6 6 6 6',
  arrowUp: 'M12 20V4m-6 6 6-6 6 6',
  arrowDown: 'M12 4v16m-6-6 6 6 6-6',
  chevronDown: 'm6 9 6 6 6-6',
  external: 'M14 4h6v6m0-6L10 14M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'm6 6 12 12M18 6 6 18',
  check: 'm5 12 4 4L19 6',
  info: 'M12 8h.01M12 11v6',
  alert: 'M12 7v6m0 4h.01',
  search: 'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  swap: 'M4 8h16m-4-4 4 4-4 4M20 16H4m4-4-4 4 4 4',
  refresh: 'M20 8a8 8 0 1 0 0 8M20 3v5h-5',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5',
  download: 'M12 3v13m-5-5 5 5 5-5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5',
  image: 'M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 5M16 7h.01',
  file: 'M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h6',
  files: 'M8 3h8l4 4v12H8zM16 3v4h4M4 7v14h12',
  chat: 'M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 3V6a2 2 0 0 1 2-2ZM7 9h10M7 13h6',
  lock: 'M6 10h12v11H6zM8 10V7a4 4 0 0 1 8 0v3M12 14v3',
  share: 'M12 16V3m-4 4 4-4 4 4M6 9H4v12h16V9h-2',
  braces: 'M8 3H6v6l-3 3 3 3v6h2M16 3h2v6l3 3-3 3v6h-2',
  diff: 'M8 3v14m-4-4 4 4 4-4M16 21V7m-4 4 4-4 4 4',
  hash: 'M9 3 7 21M17 3l-2 18M4 8h17M3 16h17',
  database: 'M20 6c0 2-4 3-8 3S4 8 4 6s4-3 8-3 8 1 8 3ZM4 6v12c0 2 4 3 8 3s8-1 8-3V6M4 12c0 2 4 3 8 3s8-1 8-3',
  pin: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  clock: 'M12 7v5l4 2',
  globe: 'M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z',
  network: 'M12 8v5M5 16v-3h14v3M9 3h6v5H9zM2 16h6v5H2zM16 16h6v5h-6z',
  server: 'M3 3h18v7H3zM3 14h18v7H3zM7 6.5h.01M7 17.5h.01M11 6.5h6M11 17.5h6',
  terminal: 'M3 4h18v16H3zM7 8l4 4-4 4M13 16h4',
  home: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
  moon: 'M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z',
  sunrise: 'M3 18h18M5 22h14M7 18a5 5 0 0 1 10 0M12 11V2m-3 3 3-3 3 3M2 13l2 1m16 0 2-1',
  sunset: 'M3 18h18M5 22h14M7 18a5 5 0 0 1 10 0M12 2v9m-3-3 3 3 3-3M2 13l2 1m16 0 2-1',
} as const

export type IconName = keyof typeof paths

export function Icon({ name, size = 18, className = '' }: { name: IconName; size?: number; className?: string }) {
  return <svg className={`ui-icon ${className}`} style={{ '--icon-size': `${size}px` } as CSSProperties} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {(name === 'info' || name === 'alert' || name === 'clock' || name === 'globe') && <circle cx="12" cy="12" r="9" />}
    <path d={paths[name]} />
  </svg>
}

const toolIcons: Record<string, IconName> = {
  'json-formatter': 'braces', 'json-diff': 'diff', 'data-converter': 'swap',
  hash: 'hash', 'sql-formatter': 'database', coordinate: 'pin', 'api-test': 'terminal',
  'timestamp-converter': 'clock', 'http-response-diagnostics': 'network', 'dns-query': 'globe',
  'common-ports': 'server', 'pdf-merge': 'files', 'pdf-image-converter': 'image',
  'document-converter': 'file', 'image-converter': 'image', 'password-generator': 'lock',
  'world-time': 'globe', 'temporary-file-share': 'share', 'temporary-chat': 'chat',
}
const fallbackIcons: Record<string, IconName> = {
  json: 'braces', diff: 'diff', hash: 'hash', sql: 'database', coordinate: 'pin',
  image: 'image', pdf: 'files', document: 'file', password: 'lock', clock: 'clock',
  network: 'network', share: 'share', chat: 'chat',
}

// This is presentation only: available tools still come exclusively from the API.
export function ToolIcon({ tool, size = 22 }: { tool: ToolDescriptor; size?: number }) {
  const name = Object.hasOwn(toolIcons, tool.slug) ? toolIcons[tool.slug]
    : Object.hasOwn(fallbackIcons, tool.iconKey) ? fallbackIcons[tool.iconKey] : 'grid'
  return <Icon name={name ?? 'grid'} size={size} />
}
