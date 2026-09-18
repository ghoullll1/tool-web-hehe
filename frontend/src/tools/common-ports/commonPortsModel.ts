import { COMMON_PORTS, PORT_CATEGORIES, type CommonPort, type PortCategoryId, type PortTransport } from './commonPortsData'

export type PortCategoryFilter = 'all' | PortCategoryId
export type PortTransportFilter = 'all' | PortTransport
export type PortBand = 'system' | 'user' | 'dynamic'

const categoryLabels = new Map(PORT_CATEGORIES.map((category) => [category.id, category.label]))

export function categoryLabel(category: PortCategoryId) {
  return categoryLabels.get(category) ?? category
}

export function portBand(port: number): PortBand {
  if (port <= 1023) return 'system'
  if (port <= 49151) return 'user'
  return 'dynamic'
}

export function portBandLabel(band: PortBand) {
  if (band === 'system') return '系统端口 · 0–1023'
  if (band === 'user') return '用户端口 · 1024–49151'
  return '动态端口 · 49152–65535'
}

export function portSecurityLabel(security: CommonPort['security']) {
  if (security === 'encrypted') return '默认加密'
  if (security === 'optional') return '可选加密'
  return '默认明文'
}

export function portLogPosition(port: number) {
  return Math.max(0, Math.min(100, (Math.log2(port + 1) / 16) * 100))
}

export interface PortFilter {
  query: string
  category: PortCategoryFilter
  transport: PortTransportFilter
}

export function filterCommonPorts({ query, category, transport }: PortFilter) {
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  const numericQuery = /^\d+$/.test(normalizedQuery) ? Number(normalizedQuery) : null

  return COMMON_PORTS
    .filter((entry) => category === 'all' || entry.category === category)
    .filter((entry) => transport === 'all' || entry.transports.includes(transport))
    .filter((entry) => {
      if (!normalizedQuery) return true
      const haystack = [
        entry.port,
        entry.service,
        entry.name,
        entry.summary,
        categoryLabel(entry.category),
        ...entry.transports,
        ...(entry.aliases ?? []),
      ].join(' ').toLocaleLowerCase('zh-CN')
      return haystack.includes(normalizedQuery)
    })
    .toSorted((left, right) => {
      if (numericQuery !== null) {
        if (left.port === numericQuery) return -1
        if (right.port === numericQuery) return 1
      }
      return left.port - right.port
    })
}

export function relatedPorts(current: CommonPort, limit = 5) {
  return COMMON_PORTS
    .filter((entry) => entry.category === current.category && entry.port !== current.port)
    .toSorted((left, right) => Math.abs(left.port - current.port) - Math.abs(right.port - current.port))
    .slice(0, limit)
}
