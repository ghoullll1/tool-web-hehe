import { isLosslessNumber } from 'lossless-json'
import { isMap, isScalar, isSeq, LineCounter, parseDocument, stringify as stringifyYaml, YAMLSeq } from 'yaml'
import { parseJsonDocument } from '../json-formatter/jsonModel'

export const MAX_DATA_SOURCE_BYTES = 3 * 1024 * 1024

export type DataFormat = 'json' | 'yaml' | 'properties'
export type SourceFormat = DataFormat | 'auto'
export type DuplicateStrategy = 'first' | 'last' | 'array'
export type JsonIndent = 2 | 4 | '\t'
export type YamlQuoteStyle = 'plain' | 'single' | 'double'
export type PropertiesSeparator = '=' | ':'

export type ConfigPrimitive = null | boolean | number | string
export type ConfigValue = ConfigPrimitive | ConfigValue[] | ConfigObject
export interface ConfigObject { [key: string]: ConfigValue }

export interface ConversionSettings {
  jsonIndent: JsonIndent
  yamlIndent: 2 | 4
  yamlLineWidth: 0 | 80 | 120
  yamlQuoteStyle: YamlQuoteStyle
  propertiesSeparator: PropertiesSeparator
  escapeUnicode: boolean
  expandPropertyPaths: boolean
  inferPropertyScalars: boolean
  duplicateStrategy: DuplicateStrategy
  sortKeys: boolean
}

export const DEFAULT_CONVERSION_SETTINGS: ConversionSettings = Object.freeze({
  jsonIndent: 2,
  yamlIndent: 2,
  yamlLineWidth: 80,
  yamlQuoteStyle: 'plain',
  propertiesSeparator: '=',
  escapeUnicode: false,
  expandPropertyPaths: true,
  inferPropertyScalars: true,
  duplicateStrategy: 'last',
  sortKeys: false,
})

export interface DataStatistics {
  nodes: number
  keys: number
  arrays: number
  maxDepth: number
  sourceBytes: number
  outputBytes: number
}

export interface ConversionResult {
  sourceFormat: DataFormat
  targetFormat: DataFormat
  output: string
  value: ConfigValue
  warnings: string[]
  statistics: DataStatistics
}

export interface DataDiagnostic {
  line: number
  column: number
}

export class DataConversionError extends Error {
  constructor(message: string, readonly diagnostic?: DataDiagnostic) {
    super(message)
    this.name = 'DataConversionError'
  }
}

export function convertData(
  source: string,
  requestedSourceFormat: SourceFormat,
  targetFormat: DataFormat,
  settings: ConversionSettings = DEFAULT_CONVERSION_SETTINGS,
): ConversionResult {
  assertSource(source)
  const detectedSourceFormat = detectDataFormat(source)
  if (requestedSourceFormat !== 'auto' && detectedSourceFormat !== requestedSourceFormat) {
    throw new DataConversionError(
      `输入格式不匹配：当前选择为 ${dataFormatLabel(requestedSourceFormat)}，实际检测为 ${dataFormatLabel(detectedSourceFormat)}，请切换输入格式或使用自动检测`,
    )
  }
  const sourceFormat = requestedSourceFormat === 'auto' ? detectedSourceFormat : requestedSourceFormat
  const warnings: string[] = []
  const parsed = parseSource(source, sourceFormat, settings, warnings)
  const value = settings.sortKeys ? sortConfigValue(parsed) : parsed
  const output = serializeValue(value, targetFormat, settings, warnings)
  const structural = collectStatistics(value)

  return {
    sourceFormat,
    targetFormat,
    output,
    value,
    warnings,
    statistics: {
      ...structural,
      sourceBytes: byteLength(source),
      outputBytes: byteLength(output),
    },
  }
}

function dataFormatLabel(format: DataFormat): string {
  if (format === 'json') return 'JSON'
  if (format === 'yaml') return 'YAML'
  return 'Properties'
}

export function detectDataFormat(source: string): DataFormat {
  assertSource(source)
  const trimmed = source.trim()

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      parseJsonValue(source, [])
      return 'json'
    } catch {
      try {
        parseYamlValue(source)
        return 'yaml'
      } catch {
        return 'json'
      }
    }
  }

  const meaningfulLines = source.split(/\r\n|\r|\n/)
    .map((line) => line.trimStart())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('!'))

  if (meaningfulLines.some(hasYamlStructureEvidence)) return 'yaml'
  if (meaningfulLines.some(hasPropertyAssignmentEvidence)) return 'properties'

  try {
    parseYamlValue(source)
    return 'yaml'
  } catch {
    try {
      parsePropertiesValue(source, DEFAULT_CONVERSION_SETTINGS, [])
      return 'properties'
    } catch {
      return 'yaml'
    }
  }
}

export function formatDataBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function dataFormatExtension(format: DataFormat): string {
  return format === 'properties' ? 'properties' : format === 'yaml' ? 'yaml' : 'json'
}

function parseSource(
  source: string,
  format: DataFormat,
  settings: ConversionSettings,
  warnings: string[],
): ConfigValue {
  if (format === 'json') return parseJsonValue(source, warnings)
  if (format === 'yaml') return parseYamlValue(source, settings, warnings)
  return parsePropertiesValue(source, settings, warnings)
}

function parseJsonValue(source: string, warnings: string[]): ConfigValue {
  try {
    return normalizeValue(parseJsonDocument(source).value, '$', warnings)
  } catch (error) {
    if (error instanceof DataConversionError) throw error
    const diagnostic = error instanceof Error && 'diagnostic' in error
      ? (error as { diagnostic?: DataDiagnostic }).diagnostic
      : undefined
    throw new DataConversionError(error instanceof Error ? error.message : 'JSON 解析失败', diagnostic)
  }
}

function parseYamlValue(
  source: string,
  settings: ConversionSettings = DEFAULT_CONVERSION_SETTINGS,
  warnings: string[] = [],
): ConfigValue {
  const lineCounter = new LineCounter()
  const document = parseDocument(source, {
    version: '1.2',
    strict: true,
    prettyErrors: true,
    stringKeys: true,
    uniqueKeys: false,
    merge: true,
    resolveKnownTags: false,
    lineCounter,
  })
  if (document.errors.length > 0) {
    const first = document.errors[0]
    throw new DataConversionError(`YAML 语法错误：${first?.message ?? '无法解析文档'}`, yamlDiagnostic(first))
  }

  try {
    resolveYamlDuplicateKeys(document.contents, '$', settings.duplicateStrategy, warnings, document.schema, lineCounter)
    return normalizeValue(document.toJS({ maxAliasCount: 50 }), '$', warnings)
  } catch (error) {
    throw new DataConversionError(error instanceof Error ? `YAML 无法转换：${error.message}` : 'YAML 无法转换')
  }
}

function resolveYamlDuplicateKeys(
  node: unknown,
  path: string,
  strategy: DuplicateStrategy,
  warnings: string[],
  schema: ConstructorParameters<typeof YAMLSeq>[0],
  lineCounter: LineCounter,
) {
  if (isSeq(node)) {
    node.items.forEach((item, index) => resolveYamlDuplicateKeys(item, `${path}[${index}]`, strategy, warnings, schema, lineCounter))
    return
  }
  if (!isMap(node)) return

  const items: typeof node.items = []
  const seen = new Map<string, { index: number; pair: (typeof node.items)[number]; sequence?: YAMLSeq }>()

  for (const pair of node.items) {
    const key = isScalar(pair.key) ? String(pair.key.value) : null
    if (key === null || key === '<<') {
      items.push(pair)
      continue
    }
    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, { index: items.length, pair })
      items.push(pair)
      continue
    }

    const duplicatePath = appendPath(path, key).replace(/^\$\.?/, '')
    const keyOffset = isScalar(pair.key) ? pair.key.range?.[0] ?? 0 : 0
    const line = lineCounter.linePos(keyOffset).line || 1
    warnings.push(`第 ${line} 行 YAML 重复配置 ${duplicatePath}，已按“${duplicateStrategyLabel(strategy)}”处理`)

    if (strategy === 'first') continue
    if (strategy === 'last') {
      items[existing.index] = pair
      existing.pair = pair
      continue
    }

    if (!existing.sequence) {
      const sequence = new YAMLSeq(schema)
      sequence.items = [existing.pair.value, pair.value]
      existing.pair.value = sequence
      existing.sequence = sequence
    } else {
      existing.sequence.items.push(pair.value)
    }
  }

  node.items = items
  for (const pair of node.items) {
    const key = isScalar(pair.key) ? String(pair.key.value) : 'value'
    resolveYamlDuplicateKeys(pair.value, appendPath(path, key), strategy, warnings, schema, lineCounter)
  }
}

function parsePropertiesValue(
  source: string,
  settings: ConversionSettings,
  warnings: string[],
): ConfigValue {
  const root: ConfigObject = Object.create(null) as ConfigObject
  const lines = logicalPropertyLines(source)

  for (const entry of lines) {
    const trimmed = entry.text.trimStart()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue
    const { rawKey, rawValue } = splitPropertyEntry(trimmed)
    if (!rawKey) throw new DataConversionError('Properties 键不能为空', { line: entry.line, column: 1 })
    const path = settings.expandPropertyPaths
      ? parsePropertyPath(rawKey, entry.line)
      : [decodePropertyEscapes(rawKey, entry.line)]
    const decoded = decodePropertyEscapes(rawValue, entry.line)
    const value = settings.inferPropertyScalars ? inferPropertyScalar(decoded) : decoded
    assignPropertyPath(root, path, value, settings.duplicateStrategy, entry.line, warnings)
  }

  return root
}

function serializeValue(
  value: ConfigValue,
  format: DataFormat,
  settings: ConversionSettings,
  warnings: string[],
): string {
  if (format === 'json') return JSON.stringify(value, null, settings.jsonIndent)
  if (format === 'yaml') {
    return stringifyYaml(value, {
      version: '1.2',
      indent: settings.yamlIndent,
      lineWidth: settings.yamlLineWidth,
      defaultStringType: settings.yamlQuoteStyle === 'single'
        ? 'QUOTE_SINGLE'
        : settings.yamlQuoteStyle === 'double' ? 'QUOTE_DOUBLE' : 'PLAIN',
      aliasDuplicateObjects: false,
      directives: false,
    }).trimEnd()
  }
  return stringifyProperties(value, settings, warnings)
}

function stringifyProperties(
  value: ConfigValue,
  settings: ConversionSettings,
  warnings: string[],
): string {
  const entries: Array<[string, ConfigPrimitive]> = []
  flattenProperties(value, '', entries, warnings)
  if (settings.sortKeys) entries.sort(([left], [right]) => left.localeCompare(right))
  return entries.map(([key, item]) => {
    const rendered = item === null ? 'null' : String(item)
    return `${escapePropertyText(key || 'value', true, settings.escapeUnicode)}${settings.propertiesSeparator}${escapePropertyText(rendered, false, settings.escapeUnicode)}`
  }).join('\n')
}

function normalizeValue(value: unknown, path: string, warnings: string[]): ConfigValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new DataConversionError(`${path} 包含无法跨格式表示的非有限数字`)
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) throw new DataConversionError(`${path} 包含超出安全范围的整数`)
    return value
  }
  if (typeof value === 'bigint') {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
      warnings.push(`${path} 的大整数已按字符串保留，避免精度丢失`)
      return value.toString()
    }
    return Number(value)
  }
  if (isLosslessNumber(value)) {
    const raw = value.toString()
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || (Number.isInteger(parsed) && !Number.isSafeInteger(parsed))) {
      throw new DataConversionError(`${path} 包含超出 JSON 安全范围的数字：${raw}`)
    }
    return parsed
  }
  if (Array.isArray(value)) return value.map((item, index) => normalizeValue(item, `${path}[${index}]`, warnings))
  if (isPlainObject(value)) {
    const output: ConfigObject = Object.create(null) as ConfigObject
    for (const [key, item] of Object.entries(value)) {
      assertSafeKey(key, path)
      output[key] = normalizeValue(item, appendPath(path, key), warnings)
    }
    return output
  }
  throw new DataConversionError(`${path} 包含不支持的配置值类型`)
}

function logicalPropertyLines(source: string): Array<{ text: string; line: number }> {
  const physical = source.split(/\r\n|\r|\n/)
  const logical: Array<{ text: string; line: number }> = []
  let buffer = ''
  let startLine = 1

  physical.forEach((line, index) => {
    if (!buffer) startLine = index + 1
    buffer += buffer ? line.trimStart() : line
    if (hasContinuation(buffer)) {
      buffer = buffer.slice(0, -1)
      return
    }
    logical.push({ text: buffer, line: startLine })
    buffer = ''
  })
  if (buffer) logical.push({ text: buffer, line: startLine })
  return logical
}

function hasContinuation(line: string): boolean {
  let slashes = 0
  for (let index = line.length - 1; index >= 0 && line[index] === '\\'; index -= 1) slashes += 1
  return slashes % 2 === 1
}

function splitPropertyEntry(line: string): { rawKey: string; rawValue: string } {
  let escaped = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index] ?? ''
    if (character === '\\') {
      escaped = !escaped
      continue
    }
    if (!escaped && (character === '=' || character === ':' || /\s/.test(character))) {
      let valueStart = index
      if (/\s/.test(character)) {
        while (valueStart < line.length && /\s/.test(line[valueStart] ?? '')) valueStart += 1
        if (line[valueStart] === '=' || line[valueStart] === ':') valueStart += 1
      } else valueStart += 1
      while (valueStart < line.length && /\s/.test(line[valueStart] ?? '')) valueStart += 1
      return { rawKey: line.slice(0, index).trimEnd(), rawValue: line.slice(valueStart) }
    }
    escaped = false
  }
  return { rawKey: line.trimEnd(), rawValue: '' }
}

function parsePropertyPath(rawKey: string, line: number): Array<string | number> {
  const path: Array<string | number> = []
  let segment = ''
  let index = 0
  let expectsFieldAfterDot = false
  const pushSegment = () => {
    if (!segment) throw new DataConversionError('Properties 路径中存在空字段', { line, column: 1 })
    assertSafeKey(segment, '$')
    path.push(segment)
    segment = ''
  }

  while (index < rawKey.length) {
    const character = rawKey[index] ?? ''
    if (character === '\\') {
      const decoded = decodePropertyEscapeAt(rawKey, index, line)
      segment += decoded.value
      index = decoded.nextIndex
      continue
    }
    if (character === '.') {
      if (segment) pushSegment()
      else if (rawKey[index - 1] !== ']') {
        throw new DataConversionError('Properties 路径中存在空字段', { line, column: index + 1 })
      }
      index += 1
      if (index >= rawKey.length) {
        throw new DataConversionError('Properties 路径不能以分隔点结尾', { line, column: index })
      }
      expectsFieldAfterDot = true
      continue
    }
    if (character === '[') {
      if (expectsFieldAfterDot) {
        throw new DataConversionError('Properties 路径中存在空字段', { line, column: index + 1 })
      }
      if (segment) pushSegment()
      const close = rawKey.indexOf(']', index + 1)
      const candidate = close === -1 ? '' : rawKey.slice(index + 1, close)
      if (!/^\d+$/.test(candidate)) throw new DataConversionError('Properties 数组路径必须使用非负整数下标', { line, column: index + 1 })
      path.push(Number(candidate))
      index = close + 1
      expectsFieldAfterDot = false
      continue
    }
    segment += character
    expectsFieldAfterDot = false
    index += 1
  }
  if (segment) pushSegment()
  if (path.length === 0 || typeof path[0] === 'number') throw new DataConversionError('Properties 路径必须从字段名开始', { line, column: 1 })
  return path
}

function assignPropertyPath(
  root: ConfigObject,
  path: Array<string | number>,
  value: ConfigValue,
  strategy: DuplicateStrategy,
  line: number,
  warnings: string[],
) {
  let current: ConfigObject | ConfigValue[] = root
  for (let index = 0; index < path.length; index += 1) {
    const segment = path[index]!
    const last = index === path.length - 1
    const next = path[index + 1]
    const existing = getContainerValue(current, segment)

    if (last) {
      if (existing.exists) {
        const label = renderPropertyPath(path)
        warnings.push(`第 ${line} 行重复配置 ${label}，已按“${duplicateStrategyLabel(strategy)}”处理`)
        if (strategy === 'first') continue
        if (strategy === 'array') value = Array.isArray(existing.value) ? [...existing.value, value] : [existing.value, value]
      }
      setContainerValue(current, segment, value)
      continue
    }

    const expectsArray = typeof next === 'number'
    if (!existing.exists) {
      const created: ConfigObject | ConfigValue[] = expectsArray ? [] : Object.create(null) as ConfigObject
      setContainerValue(current, segment, created)
      current = created
      continue
    }
    const compatible = expectsArray ? Array.isArray(existing.value) : isConfigObject(existing.value)
    if (!compatible) throw new DataConversionError(`第 ${line} 行的路径 ${renderPropertyPath(path.slice(0, index + 1))} 与已有标量配置冲突`, { line, column: 1 })
    current = existing.value as ConfigObject | ConfigValue[]
  }
}

function getContainerValue(container: ConfigObject | ConfigValue[], segment: string | number): { exists: boolean; value: ConfigValue } {
  if (Array.isArray(container)) {
    if (typeof segment !== 'number') throw new DataConversionError('Properties 数组路径后必须使用下标')
    return { exists: Object.prototype.hasOwnProperty.call(container, segment), value: container[segment] ?? null }
  }
  if (typeof segment !== 'string') throw new DataConversionError('Properties 对象路径后必须使用字段名')
  return { exists: Object.prototype.hasOwnProperty.call(container, segment), value: container[segment] ?? null }
}

function setContainerValue(container: ConfigObject | ConfigValue[], segment: string | number, value: ConfigValue) {
  if (Array.isArray(container)) {
    if (typeof segment !== 'number') throw new DataConversionError('Properties 数组路径后必须使用下标')
    while (container.length < segment) container.push(null)
    container[segment] = value
    return
  }
  if (typeof segment !== 'string') throw new DataConversionError('Properties 对象路径后必须使用字段名')
  container[segment] = value
}

function decodePropertyEscapes(value: string, line: number): string {
  let output = ''
  let index = 0
  while (index < value.length) {
    if (value[index] !== '\\') {
      output += value[index]
      index += 1
      continue
    }
    const decoded = decodePropertyEscapeAt(value, index, line)
    output += decoded.value
    index = decoded.nextIndex
  }
  return output
}

function decodePropertyEscapeAt(value: string, index: number, line: number): { value: string; nextIndex: number } {
  const escaped = value[index + 1]
  if (escaped === undefined) return { value: '\\', nextIndex: index + 1 }
  const common: Record<string, string> = { t: '\t', n: '\n', r: '\r', f: '\f' }
  if (escaped in common) return { value: common[escaped]!, nextIndex: index + 2 }
  if (escaped !== 'u') return { value: escaped, nextIndex: index + 2 }
  const hex = value.slice(index + 2, index + 6)
  if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new DataConversionError('Properties 包含无效的 Unicode 转义', { line, column: index + 1 })
  return { value: String.fromCharCode(Number.parseInt(hex, 16)), nextIndex: index + 6 }
}

function inferPropertyScalar(value: string): ConfigPrimitive {
  const normalized = value.trim()
  if (/^(true|false)$/i.test(normalized)) return normalized.toLowerCase() === 'true'
  if (/^null$/i.test(normalized)) return null
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(normalized)) {
    const number = Number(normalized)
    if (Number.isFinite(number) && (!Number.isInteger(number) || Number.isSafeInteger(number))) return number
  }
  return value
}

function flattenProperties(
  value: ConfigValue,
  path: string,
  entries: Array<[string, ConfigPrimitive]>,
  warnings: string[],
) {
  if (Array.isArray(value)) {
    if (value.length === 0) warnings.push(`${path || '$'} 是空数组，Properties 无法完整表达，已忽略`)
    value.forEach((item, index) => flattenProperties(item, `${path}[${index}]`, entries, warnings))
    return
  }
  if (isConfigObject(value)) {
    const children = Object.entries(value)
    if (children.length === 0) warnings.push(`${path || '$'} 是空对象，Properties 无法完整表达，已忽略`)
    children.forEach(([key, item]) => flattenProperties(item, path ? `${path}.${key}` : key, entries, warnings))
    return
  }
  entries.push([path, value])
}

function escapePropertyText(value: string, key: boolean, escapeUnicode: boolean): string {
  let output = ''
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? ''
    const code = value.charCodeAt(index)
    if (escapeUnicode && (code < 0x20 || code > 0x7e)) {
      output += `\\u${code.toString(16).padStart(4, '0')}`
    } else if (character === '\\') output += '\\\\'
    else if (character === '\n') output += '\\n'
    else if (character === '\r') output += '\\r'
    else if (character === '\t') output += '\\t'
    else if (key && /[\s=:# !]/.test(character)) output += `\\${character}`
    else if (!key && index === 0 && character === ' ') output += '\\ '
    else output += character
  }
  return output
}

function sortConfigValue(value: ConfigValue): ConfigValue {
  if (Array.isArray(value)) return value.map(sortConfigValue)
  if (!isConfigObject(value)) return value
  const sorted: ConfigObject = Object.create(null) as ConfigObject
  Object.keys(value).sort((left, right) => left.localeCompare(right)).forEach((key) => {
    sorted[key] = sortConfigValue(value[key]!)
  })
  return sorted
}

function collectStatistics(value: ConfigValue): Omit<DataStatistics, 'sourceBytes' | 'outputBytes'> {
  const statistics = { nodes: 0, keys: 0, arrays: 0, maxDepth: 0 }
  const visit = (current: ConfigValue, depth: number) => {
    statistics.nodes += 1
    statistics.maxDepth = Math.max(statistics.maxDepth, depth)
    if (Array.isArray(current)) {
      statistics.arrays += 1
      current.forEach((item) => visit(item, depth + 1))
    } else if (isConfigObject(current)) {
      const entries = Object.entries(current)
      statistics.keys += entries.length
      entries.forEach(([, item]) => visit(item, depth + 1))
    }
  }
  visit(value, 0)
  return statistics
}

function assertSource(source: string) {
  if (!source.trim()) throw new DataConversionError('请输入需要转换的配置内容', { line: 1, column: 1 })
  const bytes = byteLength(source)
  if (bytes > MAX_DATA_SOURCE_BYTES) throw new DataConversionError(`内容超过 ${formatDataBytes(MAX_DATA_SOURCE_BYTES)} 的浏览器处理上限`, { line: 1, column: 1 })
}

function assertSafeKey(key: string, path: string) {
  if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
    throw new DataConversionError(`${appendPath(path, key)} 使用了不安全的配置键`)
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isConfigObject(value: ConfigValue): value is ConfigObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function yamlDiagnostic(error: unknown): DataDiagnostic | undefined {
  const linePos = (error as { linePos?: Array<{ line?: number; col?: number }> } | undefined)?.linePos?.[0]
  return linePos?.line && linePos.col ? { line: linePos.line, column: linePos.col } : undefined
}

function hasYamlStructureEvidence(value: string): boolean {
  if (/^(?:---|\.\.\.)(?:\s|$)/.test(value) || /^%YAML(?:\s|$)/i.test(value)) return true
  if (/^-(?:\s|$)/.test(value)) return true
  return findSyntaxDelimiter(value, ':', true) >= 0
}

function hasPropertyAssignmentEvidence(value: string): boolean {
  const equalsIndex = findSyntaxDelimiter(value, '=')
  const yamlColonIndex = findSyntaxDelimiter(value, ':', true)
  if (equalsIndex >= 0 && (yamlColonIndex < 0 || equalsIndex < yamlColonIndex)) return true

  const compactColonIndex = findSyntaxDelimiter(value, ':')
  return compactColonIndex > 0
    && !/\s/.test(value.slice(0, compactColonIndex))
    && !/\s/.test(value[compactColonIndex + 1] ?? '')
}

function findSyntaxDelimiter(value: string, delimiter: ':' | '=', requireFollowingSpace = false): number {
  let escaped = false
  let quote: 'single' | 'double' | null = null

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? ''
    if (character === '\\' && quote !== 'single') {
      escaped = !escaped
      continue
    }
    if (!escaped && character === "'" && quote !== 'double') {
      quote = quote === 'single' ? null : 'single'
      continue
    }
    if (!escaped && character === '"' && quote !== 'single') {
      quote = quote === 'double' ? null : 'double'
      continue
    }
    if (!escaped && !quote && character === delimiter) {
      const next = value[index + 1]
      if (!requireFollowingSpace || next === undefined || /\s/.test(next)) return index
    }
    escaped = false
  }
  return -1
}

function appendPath(path: string, key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`
}

function renderPropertyPath(path: Array<string | number>): string {
  return path.map((segment, index) => typeof segment === 'number' ? `[${segment}]` : index === 0 ? segment : `.${segment}`).join('')
}

function duplicateStrategyLabel(strategy: DuplicateStrategy): string {
  return strategy === 'first' ? '保留首项' : strategy === 'last' ? '保留末项' : '合并为数组'
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}
