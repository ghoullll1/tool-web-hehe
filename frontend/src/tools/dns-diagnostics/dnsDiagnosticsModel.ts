export const DNS_RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'CAA'] as const

export type DnsRecordType = typeof DNS_RECORD_TYPES[number]
export type ComparisonState = 'CONSISTENT' | 'DIVERGENT' | 'PARTIAL' | 'NO_DATA' | 'UNAVAILABLE'
export type ResolverStatus = 'SUCCESS' | 'PARTIAL' | 'ERROR'
export type QueryStatus = 'ANSWER' | 'NO_DATA' | 'DNS_ERROR' | 'ERROR'

export interface DnsRecord { name: string; type: string; ttl: number; value: string }
export interface ChainLink { from: string; to: string; ttl: number }
export interface QueryResult {
  recordType: DnsRecordType; status: QueryStatus; responseCode: number; responseCodeName: string
  authenticatedData: boolean; truncated: boolean; durationMs: number; records: DnsRecord[]; error: string
}
export interface ResolverReport {
  id: string; name: string; vantagePoint: string; status: ResolverStatus; durationMs: number
  successfulQueries: number; queryCount: number; queries: QueryResult[]; cnameChain: ChainLink[]
}
export interface ResolverVariant {
  resolverId: string; resolverName: string; status: QueryStatus; values: string[]; minTtl: number | null; maxTtl: number | null
}
export interface RecordComparison {
  recordType: DnsRecordType; state: ComparisonState; respondingResolvers: number; resolverCount: number
  minTtl: number | null; maxTtl: number | null; variants: ResolverVariant[]; summary: string
}
export interface Finding { level: 'success' | 'info' | 'warning' | 'error'; title: string; detail: string }
export interface DnsDiagnosticsResult {
  requestedDomain: string; asciiDomain: string; recordTypes: DnsRecordType[]; resolvers: ResolverReport[]
  comparisons: RecordComparison[]; findings: Finding[]; totalDurationMs: number; inspectedAt: string; requestId: string
}

export function comparisonLabel(state: ComparisonState) {
  return ({
    CONSISTENT: '结果一致', DIVERGENT: '发现差异', PARTIAL: '部分可用',
    NO_DATA: '暂无记录', UNAVAILABLE: '不可用',
  } satisfies Record<ComparisonState, string>)[state]
}

export function resolverStatusLabel(status: ResolverStatus) {
  return ({ SUCCESS: '全部完成', PARTIAL: '部分完成', ERROR: '查询失败' } satisfies Record<ResolverStatus, string>)[status]
}

export function formatTtl(value: number | null) {
  if (value === null) return '—'
  if (value < 60) return `${value} 秒`
  if (value < 3600) return `${Math.floor(value / 60)} 分 ${value % 60} 秒`
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  return minutes ? `${hours} 小时 ${minutes} 分` : `${hours} 小时`
}
