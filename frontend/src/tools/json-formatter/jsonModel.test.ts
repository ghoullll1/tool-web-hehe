import { describe, expect, it } from 'vitest'
import {
  JsonToolError,
  MAX_JSON_BYTES,
  findJsonMatches,
  formatJson,
  minifyJson,
  parseJsonDocument,
  sortJson,
} from './jsonModel'

describe('jsonModel', () => {
  it('formats without corrupting large integers or precise decimals', () => {
    const source = '{"id":9223372036854775807,"ratio":2.370}'

    const formatted = formatJson(source, 2)

    expect(formatted).toContain('9223372036854775807')
    expect(formatted).toContain('2.370')
    expect(parseJsonDocument(formatted).statistics.unsafeNumbers).toBe(1)
  })

  it('minifies and recursively sorts object keys without reordering arrays', () => {
    const source = '{"z":{"b":1,"a":2},"a":[{"d":4,"c":3},1]}'

    expect(sortJson(source, 2)).toBe(`{
  "a": [
    {
      "c": 3,
      "d": 4
    },
    1
  ],
  "z": {
    "a": 2,
    "b": 1
  }
}`)
    expect(minifyJson(source)).toBe(source)
  })

  it('reports one-based line and column for invalid JSON', () => {
    expect(() => parseJsonDocument('{\n  "ok": true,\n  "broken":\n}')).toThrow(JsonToolError)

    try {
      parseJsonDocument('{\n  "ok": true,\n  "broken":\n}')
    } catch (error) {
      expect(error).toBeInstanceOf(JsonToolError)
      expect((error as JsonToolError).diagnostic.line).toBe(4)
      expect((error as JsonToolError).diagnostic.column).toBe(1)
    }
  })

  it('rejects duplicate object keys', () => {
    expect(() => parseJsonDocument('{"id":1,"id":2}')).toThrow(/重复字段/)
  })

  it('caps unexpectedly large browser input', () => {
    const source = `"${'x'.repeat(MAX_JSON_BYTES)}"`
    expect(() => parseJsonDocument(source)).toThrow(/处理上限/)
  })

  it('finds values and returns JSON paths', () => {
    const document = parseJsonDocument('{"users":[{"name":"Ada"},{"name":"Lin"}]}')
    expect(findJsonMatches(document.value, 'Ada')).toContainEqual({
      path: '$.users[0].name',
      preview: '"Ada"',
    })
  })

  it('does not count descendants merely because their parent path contains the query', () => {
    const document = parseJsonDocument('{"flightControl":{"windInfo":{"speed":0,"level":0}}}')

    expect(findJsonMatches(document.value, 'wind')).toEqual([{
      path: '$.flightControl.windInfo',
      preview: 'Object(2)',
    }])
  })
})
