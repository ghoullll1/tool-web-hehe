import {
  isLosslessNumber,
  isSafeNumber,
  type LosslessNumber,
  parse,
  stringify,
} from 'lossless-json'

export const MAX_JSON_BYTES = 1_000_000
export const MAX_SEARCH_RESULTS = 100

export type JsonIndent = 2 | 4 | '\t'
export type JsonPrimitive = null | boolean | string | LosslessNumber
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject
export interface JsonObject { [key: string]: JsonValue }

export interface JsonStatistics {
  bytes: number
  nodes: number
  keys: number
  maxDepth: number
  unsafeNumbers: number
}

export interface ParsedJsonDocument {
  value: JsonValue
  statistics: JsonStatistics
}

export interface JsonDiagnostic {
  message: string
  position: number
  line: number
  column: number
}

export interface JsonSearchMatch {
  path: string
  preview: string
}

export class JsonToolError extends Error {
  diagnostic: JsonDiagnostic

  constructor(diagnostic: JsonDiagnostic) {
    super(diagnostic.message)
    this.name = 'JsonToolError'
    this.diagnostic = diagnostic
  }
}

export function parseJsonDocument(source: string): ParsedJsonDocument {
  const bytes = byteLength(source)
  if (bytes > MAX_JSON_BYTES) {
    throw new JsonToolError({
      message: `JSON 超过 ${formatBytes(MAX_JSON_BYTES)} 的浏览器处理上限`,
      position: 0,
      line: 1,
      column: 1,
    })
  }

  if (source.trim().length === 0) {
    throw new JsonToolError({ message: '请输入 JSON 内容', position: 0, line: 1, column: 1 })
  }

  try {
    const value = parse(source) as JsonValue
    return { value, statistics: collectStatistics(value, bytes) }
  } catch (error) {
    throw toJsonToolError(error, source)
  }
}

export function stringifyJson(value: JsonValue, indent?: JsonIndent): string {
  const output = stringify(value, null, indent)
  if (output === undefined) {
    throw new JsonToolError({ message: '无法序列化 JSON 内容', position: 0, line: 1, column: 1 })
  }
  return output
}

export function formatJson(source: string, indent: JsonIndent): string {
  return stringifyJson(parseJsonDocument(source).value, indent)
}

export function minifyJson(source: string): string {
  return stringifyJson(parseJsonDocument(source).value)
}

export function sortJson(source: string, indent: JsonIndent): string {
  return stringifyJson(sortJsonValue(parseJsonDocument(source).value), indent)
}

export function escapeJsonText(source: string, indent: JsonIndent): string {
  return JSON.stringify(formatJson(source, indent))
}

export function unescapeJsonText(source: string, indent: JsonIndent): string {
  const parsed = parseJsonDocument(source).value
  if (typeof parsed !== 'string') {
    throw new JsonToolError({
      message: '去转义要求输入内容是一个 JSON 字符串，例如 "{\\"id\\":1}"',
      position: 0,
      line: 1,
      column: 1,
    })
  }
  return formatJson(parsed, indent)
}

export function sortJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue)
  }

  if (isJsonObject(value)) {
    const sorted: JsonObject = Object.create(null) as JsonObject
    for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right))) {
      sorted[key] = sortJsonValue(value[key]!)
    }
    return sorted
  }

  return value
}

export function findJsonMatches(
  value: JsonValue,
  query: string,
  limit = MAX_SEARCH_RESULTS,
): JsonSearchMatch[] {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return []

  const matches: JsonSearchMatch[] = []
  const searchFullPath = normalized.startsWith('$') || normalized.includes('.') || normalized.includes('[')

  function visit(current: JsonValue, path: string, key?: string) {
    if (matches.length >= limit) return

    const preview = previewJsonValue(current)
    const haystack = searchFullPath
      ? `${key ?? ''}\n${path}\n${preview}`.toLocaleLowerCase()
      : `${key ?? ''}\n${preview}`.toLocaleLowerCase()
    if (haystack.includes(normalized)) {
      matches.push({ path, preview })
    }

    if (Array.isArray(current)) {
      current.forEach((child, index) => visit(child, `${path}[${index}]`, String(index)))
    } else if (isJsonObject(current)) {
      for (const [childKey, child] of Object.entries(current)) {
        visit(child, appendJsonPath(path, childKey), childKey)
        if (matches.length >= limit) break
      }
    }
  }

  visit(value, '$')
  return matches
}

export function previewJsonValue(value: JsonValue): string {
  if (value === null) return 'null'
  if (isLosslessNumber(value)) return value.toString()
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `Array(${value.length})`
  return `Object(${Object.keys(value).length})`
}

export function isJsonContainer(value: JsonValue): value is JsonValue[] | JsonObject {
  return Array.isArray(value) || isJsonObject(value)
}

export function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !isLosslessNumber(value)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function collectStatistics(value: JsonValue, bytes: number): JsonStatistics {
  const statistics: JsonStatistics = { bytes, nodes: 0, keys: 0, maxDepth: 0, unsafeNumbers: 0 }

  function visit(current: JsonValue, depth: number) {
    statistics.nodes += 1
    statistics.maxDepth = Math.max(statistics.maxDepth, depth)

    if (isLosslessNumber(current) && !isSafeNumber(current.toString(), { approx: false })) {
      statistics.unsafeNumbers += 1
    } else if (Array.isArray(current)) {
      current.forEach((child) => visit(child, depth + 1))
    } else if (isJsonObject(current)) {
      const entries = Object.entries(current)
      statistics.keys += entries.length
      entries.forEach(([, child]) => visit(child, depth + 1))
    }
  }

  visit(value, 0)
  return statistics
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

function toJsonToolError(error: unknown, source: string): JsonToolError {
  const rawMessage = error instanceof Error ? error.message : 'JSON 解析失败'
  const match = /at position (\d+)/i.exec(rawMessage)
  const position = Math.min(Number(match?.[1] ?? 0), source.length)
  const prefix = source.slice(0, position)
  const lines = prefix.split(/\r\n|\r|\n/)
  return new JsonToolError({
    message: translateDiagnostic(rawMessage),
    position,
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  })
}

function translateDiagnostic(message: string): string {
  if (message.startsWith('Duplicate key')) return `检测到重复字段：${message}`
  if (message.startsWith('JSON value expected')) return `缺少 JSON 值：${message}`
  if (message.startsWith('Expected end of input')) return `JSON 末尾存在多余内容：${message}`
  return `JSON 语法错误：${message}`
}

export function appendJsonPath(path: string, key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key)
    ? `${path}.${key}`
    : `${path}[${JSON.stringify(key)}]`
}
