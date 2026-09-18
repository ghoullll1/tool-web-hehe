import { describe, expect, it } from 'vitest'
import {
  JsonDiffInputError,
  MAX_DIFF_ENTRIES,
  compareJsonDocuments,
} from './jsonDiffModel'

describe('jsonDiffModel', () => {
  it('reports added, removed, and changed values by JSON path', () => {
    const result = compareJsonDocuments(
      '{"same":1,"changed":"old","removed":true,"nested":{"value":1},"items":[1,2]}',
      '{"same":1,"changed":"new","added":false,"nested":{"value":2},"items":[1,3,4]}',
    )

    expect(result.entries.map(({ path, kind }) => ({ path, kind }))).toEqual([
      { path: '$.added', kind: 'added' },
      { path: '$.changed', kind: 'changed' },
      { path: '$.items[1]', kind: 'changed' },
      { path: '$.items[2]', kind: 'added' },
      { path: '$.nested.value', kind: 'changed' },
      { path: '$.removed', kind: 'removed' },
    ])
    expect(result.counts).toEqual({ added: 2, removed: 1, changed: 3 })
    expect(result.truncated).toBe(false)
  })

  it('ignores whitespace, object key order, and equivalent precise number notation', () => {
    const result = compareJsonDocuments(
      '{"large":9223372036854775807,"ratio":2.370,"amount":100,"nested":{"a":1,"b":2}}',
      '{\n  "nested":{"b":2,"a":1},"amount":1e2,"ratio":2.37,"large":9223372036854775807\n}',
    )

    expect(result.entries).toEqual([])
  })

  it('identifies which input contains invalid JSON', () => {
    expect(() => compareJsonDocuments('{"ok":true}', '{"broken":}')).toThrow(JsonDiffInputError)

    try {
      compareJsonDocuments('{"ok":true}', '{"broken":}')
    } catch (error) {
      expect((error as JsonDiffInputError).side).toBe('right')
      expect((error as JsonDiffInputError).diagnostic.line).toBe(1)
    }
  })

  it('caps the number of rendered differences', () => {
    const left = Object.fromEntries(Array.from({ length: MAX_DIFF_ENTRIES + 1 }, (_, index) => [`key${index}`, 0]))
    const right = Object.fromEntries(Array.from({ length: MAX_DIFF_ENTRIES + 1 }, (_, index) => [`key${index}`, 1]))

    const result = compareJsonDocuments(JSON.stringify(left), JSON.stringify(right))

    expect(result.entries).toHaveLength(MAX_DIFF_ENTRIES)
    expect(result.truncated).toBe(true)
  })
})
