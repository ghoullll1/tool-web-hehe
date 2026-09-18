import { describe, expect, it } from 'vitest'
import {
  convertData,
  DEFAULT_CONVERSION_SETTINGS,
  detectDataFormat,
  type ConversionSettings,
} from './dataConverterModel'

function settings(overrides: Partial<ConversionSettings> = {}): ConversionSettings {
  return { ...DEFAULT_CONVERSION_SETTINGS, ...overrides }
}

describe('data converter model', () => {
  it('converts nested JSON to formatted YAML and reports structure statistics', () => {
    const result = convertData('{"server":{"port":8080},"enabled":true}', 'json', 'yaml')

    expect(result.output).toContain('server:')
    expect(result.output).toContain('port: 8080')
    expect(result.output).toContain('enabled: true')
    expect(result.statistics.keys).toBe(3)
    expect(result.statistics.maxDepth).toBe(2)
  })

  it('converts strict YAML to sorted and indented JSON', () => {
    const result = convertData('z: 1\na:\n  active: true\n', 'yaml', 'json', settings({ sortKeys: true, jsonIndent: 4 }))

    expect(result.output).toBe('{\n    "a": {\n        "active": true\n    },\n    "z": 1\n}')
  })

  it('expands shared Properties namespaces and array indices', () => {
    const result = convertData([
      'spring.datasource.url=jdbc:mysql://localhost/app',
      'spring.datasource.pool[0].name=primary',
      'spring.datasource.pool[0].size=12',
      'feature.enabled=true',
    ].join('\n'), 'properties', 'json')

    expect(JSON.parse(result.output)).toEqual({
      spring: { datasource: { url: 'jdbc:mysql://localhost/app', pool: [{ name: 'primary', size: 12 }] } },
      feature: { enabled: true },
    })
  })

  it.each([
    ['first', 'one'],
    ['last', 'two'],
    ['array', ['one', 'two']],
  ] as const)('handles duplicate Properties keys with the %s strategy', (strategy, expected) => {
    const result = convertData('service.name=one\nservice.name=two', 'properties', 'json', settings({ duplicateStrategy: strategy }))

    expect(JSON.parse(result.output).service.name).toEqual(expected)
    expect(result.warnings[0]).toContain('重复配置 service.name')
  })

  it('supports Properties continuations, Unicode escapes, and escaped separators', () => {
    const result = convertData('message=hello\\\n  world\nlabel\\:name=\\u4e2d\\u6587', 'properties', 'json', settings({ expandPropertyPaths: false }))

    expect(JSON.parse(result.output)).toEqual({ message: 'helloworld', 'label:name': '中文' })
  })

  it('flattens arrays and nested objects to Properties with configurable output', () => {
    const result = convertData('{"servers":[{"host":"内网"}],"active":true}', 'json', 'properties', settings({
      propertiesSeparator: ':',
      escapeUnicode: true,
      sortKeys: true,
    }))

    expect(result.output).toBe('active:true\nservers[0].host:\\u5185\\u7f51')
  })

  it('auto-detects JSON, YAML, and equals-based Properties', () => {
    expect(detectDataFormat('{"name":"tool"}')).toBe('json')
    expect(detectDataFormat('service:\n  port: 8080')).toBe('yaml')
    expect(detectDataFormat('service.port=8080')).toBe('properties')
  })

  it('rejects content that does not match a manually selected source format', () => {
    expect(() => convertData('service.name=tool-web\nservice.port=8090', 'yaml', 'yaml'))
      .toThrow('输入格式不匹配：当前选择为 YAML，实际检测为 Properties')
  })

  it('keeps YAML mappings and sequences ahead of equals signs inside their values', () => {
    const yaml = [
      'service:',
      '  endpoint: https://example.com/api?mode=full&enabled=true',
      '  labels:',
      '    - env=production',
    ].join('\n')

    expect(detectDataFormat(yaml)).toBe('yaml')
    expect(convertData(yaml, 'auto', 'json').sourceFormat).toBe('yaml')
  })

  it('still detects Properties assignments containing URLs and compact colon separators', () => {
    expect(detectDataFormat('service.url=https://example.com/api?mode=full')).toBe('properties')
    expect(detectDataFormat('service.port:8090')).toBe('properties')
  })

  it('recognizes YAML flow mappings that are not valid JSON', () => {
    expect(detectDataFormat('{ service: { port: 8090 } }')).toBe('yaml')
  })

  it('applies duplicate strategies to nested YAML keys', () => {
    const yaml = 'logging:\n  level: INFO\n  level: DEBUG'

    expect(convertData(yaml, 'yaml', 'json', { ...DEFAULT_CONVERSION_SETTINGS, duplicateStrategy: 'first' }).output)
      .toContain('"level": "INFO"')
    expect(convertData(yaml, 'yaml', 'json', { ...DEFAULT_CONVERSION_SETTINGS, duplicateStrategy: 'last' }).output)
      .toContain('"level": "DEBUG"')
    const merged = convertData(yaml, 'yaml', 'json', { ...DEFAULT_CONVERSION_SETTINGS, duplicateStrategy: 'array' })
    expect(merged.output).toContain('"level": [')
    expect(merged.warnings[0]).toContain('logging.level')
  })

  it('applies duplicate strategies to repeated YAML object blocks', () => {
    const yaml = 'logging:\n  level: INFO\nlogging:\n  level: DEBUG'
    const merged = convertData(yaml, 'yaml', 'properties', { ...DEFAULT_CONVERSION_SETTINGS, duplicateStrategy: 'array' })

    expect(merged.output).toContain('logging[0].level=INFO')
    expect(merged.output).toContain('logging[1].level=DEBUG')
    expect(merged.warnings[0]).toContain('logging')
  })

  it('rejects structural conflicts and prototype-polluting paths', () => {
    expect(() => convertData('server=8080\nserver.port=8081', 'properties', 'json'))
      .toThrow(/路径 server 与已有标量配置冲突/)
    expect(() => convertData('__proto__.polluted=true', 'properties', 'json'))
      .toThrow(/不安全的配置键/)
  })

  it('rejects unsafe JSON integers rather than silently losing precision', () => {
    expect(() => convertData('{"requestId":9223372036854775807}', 'json', 'yaml'))
      .toThrow(/超出 JSON 安全范围/)
  })
})
