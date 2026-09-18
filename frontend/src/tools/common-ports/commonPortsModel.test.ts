import { describe, expect, it } from 'vitest'
import { COMMON_PORTS } from './commonPortsData'
import { filterCommonPorts, portBand, portLogPosition, relatedPorts } from './commonPortsModel'

describe('commonPortsModel', () => {
  it('keeps a broad, unique and ordered common-port catalog', () => {
    const numbers = COMMON_PORTS.map((entry) => entry.port)

    expect(COMMON_PORTS.length).toBeGreaterThanOrEqual(80)
    expect(new Set(numbers).size).toBe(numbers.length)
    expect(numbers).toEqual([...numbers].sort((left, right) => left - right))
    expect(numbers.every((port) => port >= 0 && port <= 65_535)).toBe(true)
  })

  it('documents representative web, remote, DNS and database assignments', () => {
    expect(COMMON_PORTS.find((entry) => entry.port === 22)).toMatchObject({ service: 'SSH', security: 'encrypted' })
    expect(COMMON_PORTS.find((entry) => entry.port === 53)?.transports).toEqual(['TCP', 'UDP'])
    expect(COMMON_PORTS.find((entry) => entry.port === 443)).toMatchObject({ transports: ['TCP', 'UDP'], security: 'encrypted' })
    expect(COMMON_PORTS.find((entry) => entry.port === 443)?.aliases).toContain('http3')
    expect(COMMON_PORTS.find((entry) => entry.port === 5432)?.service).toBe('POSTGRESQL')
  })

  it('documents the complete default Nacos port family without duplicate shared ports', () => {
    expect(filterCommonPorts({ query: 'nacos', category: 'all', transport: 'all' }).map((entry) => entry.port)).toEqual([
      7848,
      8080,
      8848,
      9848,
      9849,
    ])
    expect(COMMON_PORTS.find((entry) => entry.port === 8848)).toMatchObject({
      service: 'NACOS-HTTP',
      transports: ['TCP'],
    })
    expect(COMMON_PORTS.find((entry) => entry.port === 9848)?.summary).toContain('主端口加 1000')
    expect(COMMON_PORTS.filter((entry) => entry.port === 8080)).toHaveLength(1)
  })

  it('searches aliases and descriptions while composing category and transport filters', () => {
    expect(filterCommonPorts({ query: 'postgres', category: 'all', transport: 'all' }).map((entry) => entry.port)).toEqual([5432])
    expect(filterCommonPorts({ query: '远程桌面', category: 'all', transport: 'UDP' }).map((entry) => entry.port)).toEqual([3389])
    expect(filterCommonPorts({ query: '', category: 'email', transport: 'TCP' }).every((entry) => entry.category === 'email')).toBe(true)
  })

  it('uses the IANA port bands and a bounded logarithmic display position', () => {
    expect(portBand(443)).toBe('system')
    expect(portBand(1024)).toBe('user')
    expect(portBand(49_152)).toBe('dynamic')
    expect(portLogPosition(0)).toBe(0)
    expect(portLogPosition(65_535)).toBe(100)
    expect(portLogPosition(443)).toBeGreaterThan(50)
  })

  it('returns nearby entries from the same category without returning the current port', () => {
    const https = COMMON_PORTS.find((entry) => entry.port === 443)!
    const related = relatedPorts(https)

    expect(related).toHaveLength(5)
    expect(related.every((entry) => entry.category === 'web' && entry.port !== 443)).toBe(true)
  })
})
