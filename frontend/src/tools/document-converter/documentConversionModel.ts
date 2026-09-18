export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024

export const SUPPORTED_DOCUMENT_EXTENSIONS = [
  '.pdf', '.docx', '.pptx', '.xlsx', '.xls', '.html', '.htm', '.csv',
  '.json', '.xml', '.txt', '.md', '.rtf', '.eml', '.msg',
] as const

export interface ConvertedDocument {
  schemaVersion: string
  requestId: string
  title: string | null
  markdown: string
  source: {
    filename: string | null
    extension: string
    contentType: string
    sizeBytes: number
  }
  engine: string
  engineVersion: string | null
  metrics: {
    durationMs: number
    markdownCharacters: number
  }
  warnings: string[]
}

export interface MarkdownProfile {
  lines: number
  headings: number
  links: number
  codeBlocks: number
  tables: number
}

export function validateDocument(file: File): string | null {
  if (file.size <= 0) return '请选择包含内容的文档。'
  if (file.size > MAX_DOCUMENT_BYTES) return '单个文档不能超过 10 MB。'
  const extension = extensionOf(file.name)
  if (!SUPPORTED_DOCUMENT_EXTENSIONS.includes(extension as typeof SUPPORTED_DOCUMENT_EXTENSIONS[number])) {
    return '暂不支持该文件格式，请选择 PDF、Office、HTML、文本或邮件文档。'
  }
  return null
}

export function extensionOf(filename: string) {
  const separator = filename.lastIndexOf('.')
  return separator > 0 ? filename.slice(separator).toLowerCase() : ''
}

export function markdownFilename(sourceName: string | null) {
  const withoutReserved = (sourceName || 'converted-document').replace(/[\\/:*?"<>|]/g, '_')
  const safeName = Array.from(withoutReserved, (character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint < 32 ? '_' : character
  }).join('')
  const separator = safeName.lastIndexOf('.')
  const stem = separator > 0 ? safeName.slice(0, separator) : safeName
  return `${stem || 'converted-document'}.md`
}

export function profileMarkdown(markdown: string): MarkdownProfile {
  const lines = markdown ? markdown.split(/\r?\n/) : []
  return {
    lines: lines.length,
    headings: lines.filter((line) => /^#{1,6}\s+\S/.test(line)).length,
    links: (markdown.match(/\[[^\]]+\]\([^)]+\)/g) ?? []).length,
    codeBlocks: Math.floor((markdown.match(/^```/gm) ?? []).length / 2),
    tables: lines.filter((line) => /^\s*\|(?:[^|]+\|)+\s*$/.test(line)).length,
  }
}

export function parseConvertedDocument(value: unknown): ConvertedDocument {
  if (!value || typeof value !== 'object') throw new Error('转换服务返回了无法识别的结果。')
  const result = value as Partial<ConvertedDocument>
  if (
    typeof result.schemaVersion !== 'string'
    || typeof result.requestId !== 'string'
    || typeof result.markdown !== 'string'
    || !result.source || typeof result.source.sizeBytes !== 'number' || !Number.isFinite(result.source.sizeBytes) || result.source.sizeBytes < 0
    || typeof result.source.extension !== 'string'
    || !result.metrics || typeof result.metrics.durationMs !== 'number' || !Number.isFinite(result.metrics.durationMs) || result.metrics.durationMs < 0
    || typeof result.metrics.markdownCharacters !== 'number' || !Number.isFinite(result.metrics.markdownCharacters) || result.metrics.markdownCharacters < 0
    || typeof result.engine !== 'string'
    || !Array.isArray(result.warnings)
    || !result.warnings.every((warning) => typeof warning === 'string')
  ) {
    throw new Error('转换服务返回了不完整的结果。')
  }
  return result as ConvertedDocument
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
