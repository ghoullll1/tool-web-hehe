import {
  DNS_RECORD_TYPES,
  type ChainLink,
  type DnsDiagnosticsResult,
  type DnsRecord,
  type DnsRecordType,
  type Finding,
  type QueryResult,
  type RecordComparison,
  type ResolverReport,
  type ResolverVariant,
} from './dnsDiagnosticsModel'

const QUERY_TIMEOUT_MS = 5_000
const MAX_RESPONSE_BYTES = 262_144
const MAX_RECORDS = 128
const MAX_RECORD_VALUE_CODE_POINTS = 4_096

const RESOLVERS = [
  { id: 'cloudflare', name: 'Cloudflare', vantagePoint: '全球 Anycast · 浏览器直连', endpoint: 'https://cloudflare-dns.com/dns-query' },
  { id: 'google', name: 'Google Public DNS', vantagePoint: '全球 Anycast · 浏览器直连', endpoint: 'https://dns.google/resolve' },
  { id: 'alidns', name: 'AliDNS', vantagePoint: '中国网络视角 · 浏览器直连', endpoint: 'https://dns.alidns.com/resolve' },
] as const

const RECORD_TYPE_CODES: Record<DnsRecordType, number> = {
  A: 1, NS: 2, CNAME: 5, MX: 15, TXT: 16, AAAA: 28, CAA: 257,
}
const CODE_RECORD_TYPES = new Map<number, string>(
  Object.entries(RECORD_TYPE_CODES).map(([name, code]) => [code, name]),
)
const RESPONSE_CODES = new Map<number, string>([
  [0, 'NOERROR'], [1, 'FORMERR'], [2, 'SERVFAIL'], [3, 'NXDOMAIN'], [4, 'NOTIMP'], [5, 'REFUSED'],
])

interface DnsJsonAnswer { name: string; type: number; TTL: number; data: string }
interface DnsJsonResponse { Status: number; AD?: boolean; TC?: boolean; Answer?: DnsJsonAnswer[] }

export async function queryDnsInBrowser(
  rawDomain: string,
  recordTypes: readonly DnsRecordType[],
  signal: AbortSignal,
): Promise<DnsDiagnosticsResult> {
  const started = now()
  const { requestedDomain, asciiDomain } = normalizeDomain(rawDomain)
  const selectedTypes = DNS_RECORD_TYPES.filter((type) => recordTypes.includes(type))
  if (!selectedTypes.length) throw new Error('请至少选择一种 DNS 记录类型')
  if (signal.aborted) throw abortError()

  const reports = await Promise.all(RESOLVERS.map(async (resolver): Promise<ResolverReport> => {
    const queries = await Promise.all(selectedTypes.map((type) => queryResolver(resolver, asciiDomain, type, signal)))
    const successfulQueries = queries.filter((query) => query.status !== 'ERROR').length
    return {
      id: resolver.id,
      name: resolver.name,
      vantagePoint: resolver.vantagePoint,
      status: successfulQueries === queries.length ? 'SUCCESS' : successfulQueries === 0 ? 'ERROR' : 'PARTIAL',
      durationMs: Math.max(0, ...queries.map((query) => query.durationMs)),
      successfulQueries,
      queryCount: queries.length,
      queries,
      cnameChain: buildCnameChain(queries),
    }
  }))

  if (signal.aborted) throw abortError()
  const comparisons = selectedTypes.map((recordType) => compareRecords(recordType, reports))
  return {
    requestedDomain,
    asciiDomain,
    recordTypes: selectedTypes,
    resolvers: reports,
    comparisons,
    findings: buildFindings(reports, comparisons),
    totalDurationMs: elapsed(started),
    inspectedAt: new Date().toISOString(),
    requestId: createLocalRequestId(),
  }
}

async function queryResolver(
  resolver: typeof RESOLVERS[number],
  domain: string,
  recordType: DnsRecordType,
  parentSignal: AbortSignal,
): Promise<QueryResult> {
  const started = now()
  const controller = new AbortController()
  const forwardAbort = () => controller.abort(parentSignal.reason)
  parentSignal.addEventListener('abort', forwardAbort, { once: true })
  const timeout = window.setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS)
  try {
    const url = new URL(resolver.endpoint)
    url.searchParams.set('name', domain)
    url.searchParams.set('type', recordType)
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/dns-json' },
      cache: 'no-store',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'error',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const text = await readBoundedText(response)
    const payload = parseDnsResponse(text)
    const records = normalizeRecords(payload.Answer ?? [])
    const hasRequestedAnswer = records.some((record) => record.type === recordType)
    const status = payload.Status === 0 ? (hasRequestedAnswer ? 'ANSWER' : 'NO_DATA') : payload.Status === 3 ? 'NO_DATA' : 'DNS_ERROR'
    return {
      recordType,
      status,
      responseCode: payload.Status,
      responseCodeName: responseCodeName(payload.Status),
      authenticatedData: payload.AD === true,
      truncated: payload.TC === true,
      durationMs: elapsed(started),
      records,
      error: status === 'DNS_ERROR' ? `解析器返回 ${responseCodeName(payload.Status)}` : '',
    }
  } catch (error) {
    if (parentSignal.aborted) throw abortError()
    return {
      recordType,
      status: 'ERROR',
      responseCode: -1,
      responseCodeName: 'UNAVAILABLE',
      authenticatedData: false,
      truncated: false,
      durationMs: elapsed(started),
      records: [],
      error: controller.signal.aborted
        ? '浏览器查询超时'
        : error instanceof Error && error.message.startsWith('HTTP ')
          ? `解析器返回 ${error.message}`
          : error instanceof Error && ['响应超过大小限制', '解析器响应格式不正确'].includes(error.message)
            ? error.message
            : '浏览器无法连接此解析器（请检查本地网络、系统代理或跨域策略）',
    }
  } finally {
    window.clearTimeout(timeout)
    parentSignal.removeEventListener('abort', forwardAbort)
  }
}

function parseDnsResponse(text: string): DnsJsonResponse {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('解析器响应格式不正确')
  }
  if (!isObject(value) || !Number.isInteger(value.Status)) throw new Error('解析器响应格式不正确')
  if (value.Answer !== undefined && !Array.isArray(value.Answer)) throw new Error('解析器响应格式不正确')
  return value as unknown as DnsJsonResponse
}

async function readBoundedText(response: Response) {
  const advertisedSize = Number(response.headers.get('content-length'))
  if (Number.isFinite(advertisedSize) && advertisedSize > MAX_RESPONSE_BYTES) {
    throw new Error('响应超过大小限制')
  }
  if (!response.body) {
    const text = await response.text()
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) throw new Error('响应超过大小限制')
    return text
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let receivedBytes = 0
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      receivedBytes += value.byteLength
      if (receivedBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel()
        throw new Error('响应超过大小限制')
      }
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  } finally {
    reader.releaseLock()
  }
}

function normalizeRecords(answers: readonly DnsJsonAnswer[]): DnsRecord[] {
  const records = new Map<string, DnsRecord>()
  for (const answer of answers.slice(0, MAX_RECORDS)) {
    if (!isObject(answer) || typeof answer.name !== 'string' || !Number.isInteger(answer.type)
      || typeof answer.TTL !== 'number' || !Number.isFinite(answer.TTL) || typeof answer.data !== 'string') continue
    const name = normalizeHost(cleanText(answer.name))
    const type = CODE_RECORD_TYPES.get(answer.type) ?? `TYPE${answer.type}`
    const value = normalizeValue(type, cleanText(answer.data))
    if (!name || !value) continue
    const record = { name, type, ttl: Math.max(0, Math.trunc(answer.TTL)), value }
    records.set(`${record.name}\u0000${record.type}\u0000${record.ttl}\u0000${record.value}`, record)
  }
  return [...records.values()]
}

function compareRecords(recordType: DnsRecordType, reports: readonly ResolverReport[]): RecordComparison {
  const variants: ResolverVariant[] = reports.map((report) => {
    const query = report.queries.find((candidate) => candidate.recordType === recordType)
    if (!query) throw new Error(`缺少 ${recordType} 查询结果`)
    const matching = query.records.filter((record) => record.type === recordType)
    const values = [...new Set(matching.map((record) => canonicalValue(recordType, record.value)))].sort()
    const ttls = matching.map((record) => record.ttl)
    return {
      resolverId: report.id,
      resolverName: report.name,
      status: query.status,
      values,
      minTtl: ttls.length ? Math.min(...ttls) : null,
      maxTtl: ttls.length ? Math.max(...ttls) : null,
    }
  })
  const respondingResolvers = variants.filter((variant) => variant.status !== 'ERROR').length
  const comparable = variants.filter((variant) => variant.status === 'ANSWER' || variant.status === 'NO_DATA')
  const answerSets = [...new Set(comparable.map((variant) => JSON.stringify(variant.values)))]
  const hasAnswers = comparable.some((variant) => variant.values.length > 0)
  let state: RecordComparison['state']
  let summary: string
  if (!comparable.length) {
    state = 'UNAVAILABLE'
    summary = '公共解析器没有返回可比较的有效答案，请检查本地网络或代理设置。'
  } else if (!hasAnswers && comparable.length === reports.length) {
    state = 'NO_DATA'
    summary = '所有公共解析器均未返回该类型记录。'
  } else if (answerSets.length > 1) {
    state = 'DIVERGENT'
    summary = '不同公共解析器返回的记录集合不一致，可能存在地域调度、缓存或配置差异。'
  } else if (comparable.length < reports.length) {
    state = 'PARTIAL'
    summary = '已响应的解析器结果一致，但仍有解析器查询失败。'
  } else {
    state = 'CONSISTENT'
    summary = '各公共解析器返回的记录集合一致；TTL 差异单独展示。'
  }
  const ttls = variants.flatMap((variant) => [variant.minTtl, variant.maxTtl]).filter((value): value is number => value !== null)
  return {
    recordType,
    state,
    respondingResolvers,
    resolverCount: reports.length,
    minTtl: ttls.length ? Math.min(...ttls) : null,
    maxTtl: ttls.length ? Math.max(...ttls) : null,
    variants,
    summary,
  }
}

function buildFindings(reports: readonly ResolverReport[], comparisons: readonly RecordComparison[]): Finding[] {
  const complete = reports.filter((report) => report.status === 'SUCCESS').length
  const divergent = comparisons.filter((comparison) => comparison.state === 'DIVERGENT').map((comparison) => comparison.recordType)
  const completedQueries = reports.flatMap((report) => report.queries).filter((query) => query.status !== 'ERROR')
  const authenticated = completedQueries.filter((query) => query.authenticatedData).length
  return [
    {
      level: complete === reports.length ? 'success' : complete ? 'warning' : 'error',
      title: '公共解析器可用性',
      detail: `${complete} / ${reports.length} 个解析器完成了全部查询；请求由当前浏览器直接发出。`,
    },
    {
      level: divergent.length ? 'warning' : 'success',
      title: '跨解析器一致性',
      detail: divergent.length ? `以下记录类型存在差异：${divergent.join('、')}` : '未发现记录集合冲突。',
    },
    {
      level: authenticated ? 'success' : 'info',
      title: 'DNSSEC 验证标记',
      detail: authenticated
        ? `${authenticated} / ${completedQueries.length} 个有效查询带有 AD 标记。`
        : '解析器未在这些响应中返回 AD 标记；这不等同于域名一定未部署 DNSSEC。',
    },
    {
      level: 'info',
      title: '本地网络视角',
      detail: 'DoH 请求直接来自此浏览器，会使用浏览器所在设备的网络路径和系统代理；结果仍代表公共递归解析器，而非权威 DNS 直查。',
    },
  ]
}

function buildCnameChain(queries: readonly QueryResult[]): ChainLink[] {
  const links = new Map<string, ChainLink>()
  for (const record of queries.flatMap((query) => query.records)) {
    if (record.type !== 'CNAME') continue
    const link = { from: record.name, to: normalizeHost(record.value), ttl: record.ttl }
    links.set(`${link.from}\u0000${link.to}`, link)
  }
  return [...links.values()]
}

function normalizeDomain(input: string) {
  const requestedDomain = input.trim().replace(/\.+$/, '')
  if (!requestedDomain || requestedDomain.includes('://') || /[/@:]/.test(requestedDomain)
    || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(requestedDomain)) {
    throw new Error('请输入有效域名，不要输入 URL、端口或 IP 地址')
  }
  let asciiDomain: string
  try {
    asciiDomain = new URL(`https://${requestedDomain}`).hostname.toLowerCase().replace(/\.+$/, '')
  } catch {
    throw new Error('域名格式不正确')
  }
  const labels = asciiDomain.split('.')
  if (asciiDomain.length > 253 || labels.some((label) => !label || label.length > 63
    || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
    throw new Error('域名格式不正确')
  }
  return { requestedDomain, asciiDomain }
}

function normalizeValue(type: string, value: string) {
  const compact = value.trim().replace(/\s+/g, ' ')
  if (type === 'CNAME' || type === 'NS') return normalizeHost(compact)
  if (type === 'MX') {
    const separator = compact.indexOf(' ')
    return separator < 0 ? compact : `${compact.slice(0, separator)} ${normalizeHost(compact.slice(separator + 1))}`
  }
  return type === 'AAAA' ? compact.toLowerCase() : compact
}

function canonicalValue(type: DnsRecordType, value: string) {
  return ['CNAME', 'NS', 'MX', 'AAAA'].includes(type) ? value.toLowerCase() : value
}

function normalizeHost(value: string) { return value.trim().replace(/\.+$/, '').toLowerCase() }

function cleanText(value: string) {
  return Array.from(value)
    .filter((character) => !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(character))
    .slice(0, MAX_RECORD_VALUE_CODE_POINTS)
    .join('')
    .trim()
}

function responseCodeName(code: number) { return RESPONSE_CODES.get(code) ?? `RCODE_${code}` }
function isObject(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null }
function now() { return globalThis.performance?.now() ?? Date.now() }
function elapsed(started: number) { return Math.max(0, Math.round(now() - started)) }
function abortError() { return new DOMException('DNS 查询已取消', 'AbortError') }

function createLocalRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return `local-${globalThis.crypto.randomUUID()}`
  const bytes = new Uint8Array(12)
  globalThis.crypto.getRandomValues(bytes)
  return `local-${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`
}
