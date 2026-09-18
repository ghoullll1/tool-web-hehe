export type DiagnosticMethod = 'GET' | 'HEAD'
export type DiagnosticTab = 'overview' | 'redirects' | 'headers' | 'cache' | 'tls' | 'timing'
export type DiagnosticAuthType = 'NONE' | 'BASIC' | 'BEARER' | 'API_KEY'

export interface HeaderEntry { name: string; value: string }
export interface RedirectHop { sequence: number; url: string; status: number; location: string; resolvedUrl: string; durationMs: number }
export interface Finding { level: 'success' | 'info' | 'warning' | 'error'; title: string; detail: string }
export interface ControlAssessment { name: string; status: 'pass' | 'warning' | 'info' | 'not-applicable'; detail: string }
export interface PreparedDiagnosticUrl { url: string; fragmentRemoved: boolean; embeddedCredentials: boolean }
export interface TlsHandshake {
  sequence: number; url: string; host: string; handshakeMs: number; protocol: string; cipherSuite: string
  issuerOrganization: string; issuerDistinguishedName: string; subjectCommonName: string
  subjectDistinguishedName: string; validFrom: string | null; validUntil: string | null; daysRemaining: number
  serialNumber: string; signatureAlgorithm: string; certificateChainLength: number
}

export interface HttpDiagnosticsResult {
  requestedUrl: string
  finalUrl: string
  method: DiagnosticMethod
  status: number
  reasonPhrase: string
  protocol: string
  resolvedAddresses: string[]
  redirects: RedirectHop[]
  headers: HeaderEntry[]
  compression: {
    compressed: boolean; contentEncoding: string; contentType: string; contentLength: number | null
    variesByAcceptEncoding: boolean; summary: string
  }
  cache: {
    cacheControl: string; browserCacheable: boolean; sharedCacheable: boolean; freshnessSeconds: number | null
    hasValidator: boolean; validator: string; summary: string
  }
  security: {
    score: number; grade: string; heuristic: boolean; controls: ControlAssessment[]
    cookieCount: number; weakCookieCount: number; summary: string
  }
  cors: {
    configured: boolean; allowOrigin: string; allowsCredentials: boolean; allowMethods: string
    allowHeaders: string; exposeHeaders: string; permissive: boolean; summary: string
  }
  response: {
    contentType: string; charset: string; transferEncoding: string; connection: string; server: string
    poweredBy: string; contentDisposition: string; ageSeconds: number | null; cookieCount: number; summary: string
  }
  authentication: {
    configured: boolean; type: DiagnosticAuthType; sentToFinalOrigin: boolean; strippedOnRedirect: boolean; summary: string
  }
  tls: { used: boolean; handshakeCount: number; totalHandshakeMs: number; handshakes: TlsHandshake[]; summary: string }
  timing: { dnsMs: number; connectionAndHeadersMs: number; totalMs: number; redirectCount: number; note: string }
  findings: Finding[]
  inspectedAt: string
  requestId: string
}

export function parseDiagnosticsResult(value: Record<string, unknown>): HttpDiagnosticsResult {
  const compression = value.compression
  const cache = value.cache
  const security = value.security
  const cors = value.cors
  const response = value.response
  const authentication = value.authentication
  const tls = value.tls
  const timing = value.timing
  const valid = isString(value.requestedUrl) && isString(value.finalUrl)
    && (value.method === 'GET' || value.method === 'HEAD')
    && isNumber(value.status) && isString(value.reasonPhrase) && isString(value.protocol)
    && isStringArray(value.resolvedAddresses)
    && Array.isArray(value.redirects) && value.redirects.every(isRedirectHop)
    && Array.isArray(value.headers) && value.headers.every(isHeaderEntry)
    && isObject(compression) && isBoolean(compression.compressed) && isString(compression.contentEncoding)
    && isString(compression.contentType) && isNullableNumber(compression.contentLength)
    && isBoolean(compression.variesByAcceptEncoding) && isString(compression.summary)
    && isObject(cache) && isString(cache.cacheControl) && isBoolean(cache.browserCacheable)
    && isBoolean(cache.sharedCacheable) && isNullableNumber(cache.freshnessSeconds)
    && isBoolean(cache.hasValidator) && isString(cache.validator) && isString(cache.summary)
    && isObject(security) && isNumber(security.score) && isString(security.grade) && isBoolean(security.heuristic)
    && Array.isArray(security.controls) && security.controls.every(isControlAssessment)
    && isNumber(security.cookieCount) && isNumber(security.weakCookieCount) && isString(security.summary)
    && isObject(cors) && isBoolean(cors.configured) && isString(cors.allowOrigin) && isBoolean(cors.allowsCredentials)
    && isString(cors.allowMethods) && isString(cors.allowHeaders) && isString(cors.exposeHeaders)
    && isBoolean(cors.permissive) && isString(cors.summary)
    && isObject(response) && isString(response.contentType) && isString(response.charset)
    && isString(response.transferEncoding) && isString(response.connection) && isString(response.server)
    && isString(response.poweredBy) && isString(response.contentDisposition) && isNullableNumber(response.ageSeconds)
    && isNumber(response.cookieCount) && isString(response.summary)
    && isObject(authentication) && isBoolean(authentication.configured) && isAuthType(authentication.type)
    && isBoolean(authentication.sentToFinalOrigin) && isBoolean(authentication.strippedOnRedirect)
    && isString(authentication.summary)
    && isTlsAnalysis(tls)
    && isObject(timing) && isNumber(timing.dnsMs) && isNumber(timing.connectionAndHeadersMs)
    && isNumber(timing.totalMs) && isNumber(timing.redirectCount) && isString(timing.note)
    && Array.isArray(value.findings) && value.findings.every(isFinding)
    && isString(value.inspectedAt) && isString(value.requestId)
  if (!valid) {
    throw new Error('服务端返回了无法识别的诊断结果')
  }
  return value as unknown as HttpDiagnosticsResult
}

export function prepareDiagnosticUrl(value: string): PreparedDiagnosticUrl {
  const trimmed = value.trim()
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { url: trimmed, fragmentRemoved: false, embeddedCredentials: false }
    }
    const fragmentRemoved = parsed.hash.length > 0
    const embeddedCredentials = parsed.username.length > 0 || parsed.password.length > 0
    if (!fragmentRemoved && !embeddedCredentials) {
      return { url: trimmed, fragmentRemoved: false, embeddedCredentials: false }
    }
    parsed.hash = ''
    parsed.username = ''
    parsed.password = ''
    return { url: parsed.toString(), fragmentRemoved, embeddedCredentials }
  } catch {
    return { url: trimmed, fragmentRemoved: false, embeddedCredentials: false }
  }
}

const HEADER_HELP: Record<string, { category: string; description: string }> = {
  'age': { category: '缓存', description: '响应在共享缓存中已经存放的秒数。' },
  'cache-control': { category: '缓存', description: '定义浏览器与共享缓存能否存储、复用以及何时重新验证响应。' },
  'content-disposition': { category: '内容', description: '说明内容以内联方式展示，还是作为附件下载，并可携带建议文件名。' },
  'content-encoding': { category: '压缩', description: '标识响应正文使用的压缩编码，例如 gzip、br 或 zstd。' },
  'content-length': { category: '传输', description: '声明传输正文的字节数；分块传输时通常不会出现。' },
  'content-security-policy': { category: '安全', description: '限制页面可加载的脚本、样式、图片与嵌入来源，降低注入风险。' },
  'content-type': { category: '内容', description: '声明响应媒体类型与可选字符编码，指导客户端如何解析内容。' },
  'date': { category: '通用', description: '源站或代理生成此响应时使用的标准 HTTP 日期。' },
  'etag': { category: '缓存', description: '响应版本标识，客户端可用于条件请求和低成本重新验证。' },
  'expires': { category: '缓存', description: '传统的绝对过期时间；Cache-Control 通常拥有更高优先级。' },
  'last-modified': { category: '缓存', description: '资源最后修改时间，可与 If-Modified-Since 配合重新验证。' },
  'location': { category: '重定向', description: '给出重定向目标，或新建资源的位置。' },
  'server': { category: '披露', description: '标识处理响应的服务器软件；过于具体的版本可能增加指纹暴露。' },
  'set-cookie': { category: '会话', description: '要求浏览器存储 Cookie；应结合 Secure、HttpOnly 与 SameSite 属性评估。' },
  'strict-transport-security': { category: '安全', description: '要求浏览器在有效期内仅通过 HTTPS 访问当前站点。' },
  'transfer-encoding': { category: '传输', description: '描述逐跳传输编码，例如 HTTP/1.1 的 chunked。' },
  'vary': { category: '缓存', description: '指出缓存键还必须考虑哪些请求头，避免向不同客户端复用错误变体。' },
  'x-content-type-options': { category: '安全', description: 'nosniff 可禁止浏览器猜测 MIME 类型，减少内容类型混淆。' },
  'x-frame-options': { category: '安全', description: '限制页面能否被 frame 嵌入，用于降低点击劫持风险。' },
  'referrer-policy': { category: '隐私', description: '控制页面跳转或子资源请求中 Referer 信息的发送范围。' },
  'permissions-policy': { category: '安全', description: '限制摄像头、麦克风、定位等浏览器能力在文档中的可用范围。' },
  'access-control-allow-origin': { category: 'CORS', description: '声明允许读取跨域响应的浏览器来源。' },
  'access-control-allow-credentials': { category: 'CORS', description: '声明跨域请求是否可以携带 Cookie 或 HTTP 认证信息。' },
  'access-control-allow-methods': { category: 'CORS', description: '预检响应允许跨域调用使用的 HTTP 方法集合。' },
  'access-control-allow-headers': { category: 'CORS', description: '预检响应允许跨域请求携带的非简单请求头。' },
  'access-control-expose-headers': { category: 'CORS', description: '额外允许浏览器脚本读取的响应头名称。' },
  'access-control-max-age': { category: 'CORS', description: '浏览器可缓存预检结果的秒数。' },
  'cf-cache-status': { category: '代理', description: 'Cloudflare 对本次响应的边缘缓存处理结果。' },
  'cf-ray': { category: '代理', description: 'Cloudflare 请求追踪标识，通常包含处理数据中心代码。' },
}

export function describeHeader(name: string) {
  return HEADER_HELP[name.toLowerCase()] ?? {
    category: '扩展',
    description: '由源站或中间代理提供的扩展响应元数据；具体语义需参考该产品或服务文档。',
  }
}

export function statusTone(status: number) {
  if (status >= 200 && status < 300) return 'success'
  if (status >= 300 && status < 400) return 'redirect'
  if (status >= 400 && status < 500) return 'warning'
  return 'error'
}

export function formatBytes(bytes: number | null) {
  if (bytes === null) return '未声明'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isString(value: unknown): value is string { return typeof value === 'string' }
function isNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) }
function isBoolean(value: unknown): value is boolean { return typeof value === 'boolean' }
function isNullableNumber(value: unknown): value is number | null { return value === null || isNumber(value) }
function isStringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every(isString) }
function isAuthType(value: unknown): value is DiagnosticAuthType { return ['NONE', 'BASIC', 'BEARER', 'API_KEY'].includes(String(value)) }

function isHeaderEntry(value: unknown): value is HeaderEntry {
  return isObject(value) && isString(value.name) && isString(value.value)
}

function isRedirectHop(value: unknown): value is RedirectHop {
  return isObject(value) && isNumber(value.sequence) && isString(value.url) && isNumber(value.status)
    && isString(value.location) && isString(value.resolvedUrl) && isNumber(value.durationMs)
}

function isFinding(value: unknown): value is Finding {
  return isObject(value) && ['success', 'info', 'warning', 'error'].includes(String(value.level))
    && isString(value.title) && isString(value.detail)
}

function isControlAssessment(value: unknown): value is ControlAssessment {
  return isObject(value) && isString(value.name)
    && ['pass', 'warning', 'info', 'not-applicable'].includes(String(value.status)) && isString(value.detail)
}

function isTlsHandshake(value: unknown): value is TlsHandshake {
  return isObject(value) && isNumber(value.sequence) && isString(value.url) && isString(value.host)
    && isNumber(value.handshakeMs) && isString(value.protocol) && isString(value.cipherSuite)
    && isString(value.issuerOrganization) && isString(value.issuerDistinguishedName)
    && isString(value.subjectCommonName) && isString(value.subjectDistinguishedName)
    && isNullableDateString(value.validFrom) && isNullableDateString(value.validUntil) && isNumber(value.daysRemaining)
    && isString(value.serialNumber) && isString(value.signatureAlgorithm) && isNumber(value.certificateChainLength)
}

function isTlsAnalysis(value: unknown): value is HttpDiagnosticsResult['tls'] {
  if (!isObject(value) || !isBoolean(value.used) || !isNumber(value.handshakeCount)
    || !isNumber(value.totalHandshakeMs) || !Array.isArray(value.handshakes)
    || !value.handshakes.every(isTlsHandshake) || !isString(value.summary)) return false
  return value.handshakeCount === value.handshakes.length && value.used === (value.handshakes.length > 0)
}

function isNullableDateString(value: unknown): value is string | null {
  return value === null || (isString(value) && Number.isFinite(Date.parse(value)))
}
