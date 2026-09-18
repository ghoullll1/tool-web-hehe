import { parse, stringify } from 'lossless-json'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
export type BodyType = 'none' | 'json' | 'text' | 'form-urlencoded' | 'form-data'
export type AuthType = 'none' | 'bearer' | 'basic' | 'api-key'
export type RequestCodeFormat = 'curl' | 'powershell' | 'javascript' | 'python' | 'http'
export type ParameterValueType = 'string' | 'number' | 'boolean' | 'json'

export interface KeyValueRow {
  id: string
  key: string
  value: string
  enabled: boolean
  valueType?: ParameterValueType
  description?: string
}

export interface ApiRequestConfig {
  method: HttpMethod
  url: string
  query: readonly KeyValueRow[]
  headers: readonly KeyValueRow[]
  bodyType: BodyType
  bodyText: string
  bodyFields: readonly KeyValueRow[]
  authType: AuthType
  authToken: string
  authUsername: string
  authPassword: string
  apiKeyName: string
  apiKeyValue: string
  apiKeyLocation: 'header' | 'query'
  timeoutMs: number
}

export interface ApiResponseResult {
  status: number
  statusText: string
  ok: boolean
  url: string
  headers: KeyValueRow[]
  rawBody: string
  formattedBody: string
  contentType: string
  sizeBytes: number
  truncated: boolean
  startedAt: Date
  timeToHeadersMs: number
  downloadMs: number
  totalMs: number
  request: PreparedRequest
}

export interface PreparedRequest {
  method: HttpMethod
  url: string
  headers: KeyValueRow[]
  bodyType: BodyType
  bodyText: string
  bodyFields: KeyValueRow[]
}

export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024
export const METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
export const PARAMETER_VALUE_TYPES: readonly { id: ParameterValueType; label: string; hint: string }[] = [
  { id: 'string', label: 'String', hint: '按原始文本编码' },
  { id: 'number', label: 'Number', hint: '校验为有效数字' },
  { id: 'boolean', label: 'Boolean', hint: '仅允许 true / false' },
  { id: 'json', label: 'JSON', hint: '校验并压缩 JSON' },
]
export const BODY_TYPES: readonly { id: BodyType; label: string }[] = [
  { id: 'none', label: '无 Body' },
  { id: 'json', label: 'JSON' },
  { id: 'text', label: 'Text' },
  { id: 'form-urlencoded', label: 'x-www-form-urlencoded' },
  { id: 'form-data', label: 'Form Data' },
]
export const REQUEST_CODE_FORMATS: readonly { id: RequestCodeFormat; label: string }[] = [
  { id: 'curl', label: 'cURL' },
  { id: 'powershell', label: 'PowerShell' },
  { id: 'javascript', label: 'JavaScript Fetch' },
  { id: 'python', label: 'Python requests' },
  { id: 'http', label: 'Raw HTTP' },
]

export class ApiRequestError extends Error {
  constructor(message: string, public readonly kind: 'validation' | 'network' | 'timeout' | 'cancelled' | 'response-limit') {
    super(message)
    this.name = 'ApiRequestError'
  }
}

export function createRow(key = '', value = '', valueType: ParameterValueType = 'string'): KeyValueRow {
  return { id: crypto.randomUUID(), key, value, enabled: true, valueType, description: '' }
}

export function buildRequestUrl(rawUrl: string, rows: readonly KeyValueRow[], config: Pick<ApiRequestConfig, 'authType' | 'apiKeyName' | 'apiKeyValue' | 'apiKeyLocation'>): string {
  let url: URL
  try { url = new URL(rawUrl.trim()) } catch { throw new ApiRequestError('请输入完整的 HTTP 或 HTTPS 接口地址', 'validation') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new ApiRequestError('接口地址仅支持 HTTP 或 HTTPS 协议', 'validation')
  if (url.username || url.password) throw new ApiRequestError('请不要在 URL 中嵌入用户名或密码，请使用认证设置', 'validation')
  activeRows(rows).forEach((row) => url.searchParams.append(row.key, serializeParameterValue(row)))
  if (config.authType === 'api-key' && config.apiKeyLocation === 'query') {
    if (!config.apiKeyName.trim()) throw new ApiRequestError('请填写 API Key 参数名', 'validation')
    url.searchParams.set(config.apiKeyName.trim(), config.apiKeyValue)
  }
  return url.toString()
}

export function buildRequestHeaders(config: Pick<ApiRequestConfig, 'headers' | 'authType' | 'authToken' | 'authUsername' | 'authPassword' | 'apiKeyName' | 'apiKeyValue' | 'apiKeyLocation' | 'bodyType'>): Headers {
  const headers = new Headers()
  for (const { key, value } of activeRows(config.headers)) {
    try { headers.append(key, value) } catch { throw new ApiRequestError(`请求头名称或内容无效：${key}`, 'validation') }
  }
  if (config.authType === 'bearer') {
    if (!config.authToken) throw new ApiRequestError('请填写 Bearer Token', 'validation')
    headers.set('Authorization', `Bearer ${config.authToken}`)
  } else if (config.authType === 'basic') {
    if (!config.authUsername) throw new ApiRequestError('请填写 Basic Auth 用户名', 'validation')
    headers.set('Authorization', `Basic ${toBase64(`${config.authUsername}:${config.authPassword}`)}`)
  } else if (config.authType === 'api-key' && config.apiKeyLocation === 'header') {
    if (!config.apiKeyName.trim()) throw new ApiRequestError('请填写 API Key Header 名称', 'validation')
    headers.set(config.apiKeyName.trim(), config.apiKeyValue)
  }
  if (config.bodyType === 'json' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (config.bodyType === 'text' && !headers.has('Content-Type')) headers.set('Content-Type', 'text/plain;charset=UTF-8')
  if (config.bodyType === 'form-urlencoded' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/x-www-form-urlencoded;charset=UTF-8')
  return headers
}

export function buildRequestBody(config: Pick<ApiRequestConfig, 'method' | 'bodyType' | 'bodyText' | 'bodyFields'>): BodyInit | undefined {
  if (['GET', 'HEAD'].includes(config.method) || config.bodyType === 'none') return undefined
  if (config.bodyType === 'json') {
    if (!config.bodyText.trim()) return ''
    try { JSON.parse(config.bodyText) } catch { throw new ApiRequestError('JSON Body 格式不正确', 'validation') }
    return config.bodyText
  }
  if (config.bodyType === 'text') return config.bodyText
  if (config.bodyType === 'form-urlencoded') {
    const body = new URLSearchParams()
    activeRows(config.bodyFields).forEach(({ key, value }) => body.append(key, value))
    return body
  }
  const body = new FormData()
  activeRows(config.bodyFields).forEach(({ key, value }) => body.append(key, value))
  return body
}

export async function executeApiRequest(config: ApiRequestConfig, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<ApiResponseResult> {
  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs < 100 || config.timeoutMs > 120_000) throw new ApiRequestError('超时时间应在 100–120000 ms 之间', 'validation')
  const requestUrl = buildRequestUrl(config.url, config.query, config)
  const headers = buildRequestHeaders(config)
  const body = buildRequestBody(config)
  const request: PreparedRequest = {
    method: config.method,
    url: requestUrl,
    headers: [...headers.entries()].map(([key, value], index) => ({ id: `request-header-${index}`, key, value, enabled: true })),
    bodyType: config.bodyType,
    bodyText: serializeRequestBody(config),
    bodyFields: activeRows(config.bodyFields),
  }
  const startedAt = new Date()
  const start = performance.now()
  let response: Response
  try {
    response = await fetcher(requestUrl, { method: config.method, headers, body, signal, redirect: 'follow', cache: 'no-store', credentials: 'omit' })
  } catch (error) {
    if (signal.aborted) throw new ApiRequestError(String(signal.reason ?? '').includes('timeout') ? '请求超时' : '请求已取消', String(signal.reason ?? '').includes('timeout') ? 'timeout' : 'cancelled')
    throw new ApiRequestError(error instanceof Error ? `网络请求失败：${error.message}。请检查地址、证书和目标接口 CORS 配置` : '网络请求失败，请检查目标接口 CORS 配置', 'network')
  }
  const headersAt = performance.now()
  const { text, sizeBytes, truncated } = await readBoundedBody(response)
  const end = performance.now()
  const contentType = response.headers.get('content-type') ?? ''
  return {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    url: response.url || requestUrl,
    headers: [...response.headers.entries()].map(([key, value], index) => ({ id: `response-header-${index}`, key, value, enabled: true })),
    rawBody: text,
    formattedBody: formatResponseBody(text, contentType),
    contentType,
    sizeBytes,
    truncated,
    startedAt,
    timeToHeadersMs: headersAt - start,
    downloadMs: end - headersAt,
    totalMs: end - start,
    request,
  }
}

export function generateRequestCode(request: PreparedRequest, format: RequestCodeFormat): string {
  if (format === 'curl') return generateCurl(request)
  if (format === 'powershell') return generatePowerShell(request)
  if (format === 'javascript') return generateJavaScript(request)
  if (format === 'python') return generatePython(request)
  return generateRawHttp(request)
}

export function formatResponseBody(text: string, contentType: string): string {
  if (!text) return ''
  if (contentType.includes('json') || /^\s*(?:\{|\[)/.test(text)) {
    try { return stringify(parse(text), null, 2) ?? text } catch { return text }
  }
  return text
}

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function serializeParameterValue(row: Pick<KeyValueRow, 'key' | 'value' | 'valueType'>): string {
  const type = row.valueType ?? 'string'
  const value = row.value.trim()
  const name = row.key.trim() || '未命名参数'
  if (type === 'string') return row.value
  if (type === 'number') {
    if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) throw new ApiRequestError(`Query 参数“${name}”需要有效的 Number 值`, 'validation')
    return value
  }
  if (type === 'boolean') {
    if (!/^(?:true|false)$/i.test(value)) throw new ApiRequestError(`Query 参数“${name}”仅允许 true 或 false`, 'validation')
    return value.toLowerCase()
  }
  try {
    return stringify(parse(value)) ?? value
  } catch {
    throw new ApiRequestError(`Query 参数“${name}”需要有效的 JSON 值`, 'validation')
  }
}

function activeRows(rows: readonly KeyValueRow[]) {
  return rows.filter((row) => row.enabled && row.key.trim()).map((row) => ({ ...row, key: row.key.trim() }))
}

function serializeRequestBody(config: Pick<ApiRequestConfig, 'method' | 'bodyType' | 'bodyText' | 'bodyFields'>) {
  if (['GET', 'HEAD'].includes(config.method) || config.bodyType === 'none') return ''
  if (config.bodyType === 'json' || config.bodyType === 'text') return config.bodyText
  return new URLSearchParams(activeRows(config.bodyFields).map(({ key, value }) => [key, value])).toString()
}

function generateCurl(request: PreparedRequest) {
  const lines = [`curl --location --request ${request.method} ${shellQuote(request.url)}`]
  request.headers.forEach(({ key, value }) => lines.push(`  --header ${shellQuote(`${key}: ${value}`)}`))
  if (request.bodyType === 'form-data') request.bodyFields.forEach(({ key, value }) => lines.push(`  --form ${shellQuote(`${key}=${value}`)}`))
  else if (request.bodyText) lines.push(`  --data-raw ${shellQuote(request.bodyText)}`)
  return lines.map((line, index) => index < lines.length - 1 ? `${line} \\` : line).join('\n')
}

function generatePowerShell(request: PreparedRequest) {
  const headerLines = request.headers.map(({ key, value }) => `  ${powerShellQuote(key)} = ${powerShellQuote(value)}`)
  const lines = headerLines.length ? [`$headers = @{`, ...headerLines, `}`, ''] : []
  if (request.bodyType === 'form-data') {
    lines.push('$form = @{', ...request.bodyFields.map(({ key, value }) => `  ${powerShellQuote(key)} = ${powerShellQuote(value)}`), '}', '')
  }
  const parts = [`Invoke-WebRequest -Uri ${powerShellQuote(request.url)}`, `-Method ${request.method}`]
  if (headerLines.length) parts.push('-Headers $headers')
  if (request.bodyType === 'form-data') parts.push('-Form $form')
  else if (request.bodyText) parts.push(`-Body ${powerShellQuote(request.bodyText)}`)
  lines.push(parts.join(' `\n  '))
  return lines.join('\n')
}

function generateJavaScript(request: PreparedRequest) {
  const headerObject = Object.fromEntries(request.headers.map(({ key, value }) => [key, value]))
  const lines: string[] = []
  if (request.bodyType === 'form-data') {
    lines.push('const formData = new FormData()')
    request.bodyFields.forEach(({ key, value }) => lines.push(`formData.append(${JSON.stringify(key)}, ${JSON.stringify(value)})`))
    lines.push('')
  }
  const options = [`  method: ${JSON.stringify(request.method)}`]
  if (request.headers.length) options.push(`  headers: ${JSON.stringify(headerObject, null, 2).replace(/\n/g, '\n  ')}`)
  if (request.bodyType === 'form-data') options.push('  body: formData')
  else if (request.bodyText) options.push(`  body: ${JSON.stringify(request.bodyText)}`)
  lines.push(`const response = await fetch(${JSON.stringify(request.url)}, {\n${options.join(',\n')}\n})`, 'const data = await response.text()')
  return lines.join('\n')
}

function generatePython(request: PreparedRequest) {
  const lines = ['import requests', '']
  const requestArguments = [`    ${JSON.stringify(request.method)}`, `    ${JSON.stringify(request.url)}`]
  if (request.headers.length) requestArguments.push(`    headers=${JSON.stringify(Object.fromEntries(request.headers.map(({ key, value }) => [key, value])), null, 2).replace(/\n/g, '\n    ')}`)
  if (request.bodyType === 'form-data') requestArguments.push(`    files={\n${request.bodyFields.map(({ key, value }) => `        ${JSON.stringify(key)}: (None, ${JSON.stringify(value)})`).join(',\n')}\n    }`)
  else if (request.bodyText) requestArguments.push(`    data=${JSON.stringify(request.bodyText)}`)
  lines.push(`response = requests.request(\n${requestArguments.join(',\n')}\n)`, 'print(response.text)')
  return lines.join('\n')
}

function generateRawHttp(request: PreparedRequest) {
  const url = new URL(request.url)
  const headers = request.headers.filter(({ key }) => key.toLowerCase() !== 'host')
  const body = request.bodyType === 'form-data' ? '[multipart/form-data body generated by browser]' : request.bodyText
  return [`${request.method} ${url.pathname}${url.search} HTTP/1.1`, `Host: ${url.host}`, ...headers.map(({ key, value }) => `${key}: ${value}`), '', body].join('\n')
}

function shellQuote(value: string) { return `'${value.replace(/'/g, `'"'"'`)}'` }
function powerShellQuote(value: string) { return `'${value.replace(/'/g, "''")}'` }

function toBase64(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

async function readBoundedBody(response: Response): Promise<{ text: string; sizeBytes: number; truncated: boolean }> {
  if (!response.body) return { text: '', sizeBytes: 0, truncated: false }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let sizeBytes = 0
  let truncated = false
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (sizeBytes + value.byteLength > MAX_RESPONSE_BYTES) {
      const remaining = MAX_RESPONSE_BYTES - sizeBytes
      if (remaining > 0) chunks.push(value.subarray(0, remaining))
      sizeBytes += remaining
      truncated = true
      await reader.cancel()
      break
    }
    chunks.push(value)
    sizeBytes += value.byteLength
  }
  const combined = new Uint8Array(sizeBytes)
  let offset = 0
  chunks.forEach((chunk) => { combined.set(chunk, offset); offset += chunk.byteLength })
  return { text: new TextDecoder().decode(combined), sizeBytes, truncated }
}
