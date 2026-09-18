import type { ToolDescriptor } from '../types/tool'

const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  ai: 'AI 工具',
  developer: '开发工具',
  password: '密码工具',
  network: '网络工具',
  text: '文本工具',
  markdown: 'Markdown 工具',
  learning: '学习工具',
  graphics: '图形工具',
  image: '图片工具',
  pdf: '文档工具',
  finance: '财务工具',
  ecommerce: '电商工具',
  other: '其他工具',
}

const TOOL_MARKS: Readonly<Record<string, string>> = {
  json: '{ }',
  diff: 'Δ',
  hash: '#',
  sql: 'SQL',
  coordinate: '◎',
  image: '▧',
  pdf: 'PDF',
  document: 'DOC',
  password: '••',
  clock: '◷',
  network: '↗',
  share: '⇧',
}

export function toolMark(tool: ToolDescriptor) {
  return TOOL_MARKS[tool.iconKey] ?? tool.displayName.slice(0, 1)
}

export function formatCategory(code: string) {
  return CATEGORY_LABELS[code] ?? code.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function toolHref(tool: ToolDescriptor) {
  return `/tools/${encodeURIComponent(tool.slug)}`
}

export function compareCategoryCodes(left: string, right: string) {
  if (left === right) return 0
  if (left === 'other') return 1
  if (right === 'other') return -1
  return 0
}
