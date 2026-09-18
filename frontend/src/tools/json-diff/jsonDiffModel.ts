import { isLosslessNumber } from 'lossless-json'
import {
  JsonToolError,
  appendJsonPath,
  isJsonObject,
  parseJsonDocument,
  stringifyJson,
  type JsonDiagnostic,
  type JsonValue,
} from '../json-formatter/jsonModel'

export const MAX_DIFF_ENTRIES = 500

export type JsonDiffKind = 'added' | 'removed' | 'changed'
export type JsonDiffSide = 'left' | 'right'

export interface JsonDiffEntry {
  path: string
  kind: JsonDiffKind
  left: JsonValue | undefined
  right: JsonValue | undefined
}

export interface JsonDiffResult {
  entries: JsonDiffEntry[]
  counts: Record<JsonDiffKind, number>
  truncated: boolean
}

export class JsonDiffInputError extends Error {
  side: JsonDiffSide
  diagnostic: JsonDiagnostic

  constructor(side: JsonDiffSide, diagnostic: JsonDiagnostic) {
    super(diagnostic.message)
    this.name = 'JsonDiffInputError'
    this.side = side
    this.diagnostic = diagnostic
  }
}

export function compareJsonDocuments(leftSource: string, rightSource: string): JsonDiffResult {
  const left = parseInput(leftSource, 'left')
  const right = parseInput(rightSource, 'right')
  const entries: JsonDiffEntry[] = []
  const counts: Record<JsonDiffKind, number> = { added: 0, removed: 0, changed: 0 }
  let truncated = false

  function addEntry(entry: JsonDiffEntry) {
    if (entries.length >= MAX_DIFF_ENTRIES) {
      truncated = true
      return
    }
    entries.push(entry)
    counts[entry.kind] += 1
  }

  function compare(leftValue: JsonValue, rightValue: JsonValue, path: string) {
    if (entries.length >= MAX_DIFF_ENTRIES) {
      truncated = true
      return
    }

    if (Array.isArray(leftValue) && Array.isArray(rightValue)) {
      const maxLength = Math.max(leftValue.length, rightValue.length)
      for (let index = 0; index < maxLength; index += 1) {
        if (entries.length >= MAX_DIFF_ENTRIES) {
          truncated = true
          break
        }
        const childPath = `${path}[${index}]`
        if (index >= leftValue.length) {
          addEntry({ path: childPath, kind: 'added', left: undefined, right: rightValue[index] })
        } else if (index >= rightValue.length) {
          addEntry({ path: childPath, kind: 'removed', left: leftValue[index], right: undefined })
        } else {
          compare(leftValue[index]!, rightValue[index]!, childPath)
        }
      }
      return
    }

    if (isJsonObject(leftValue) && isJsonObject(rightValue)) {
      const keys = [...new Set([...Object.keys(leftValue), ...Object.keys(rightValue)])]
        .sort((leftKey, rightKey) => leftKey.localeCompare(rightKey))
      for (const key of keys) {
        if (entries.length >= MAX_DIFF_ENTRIES) {
          truncated = true
          break
        }
        const childPath = appendJsonPath(path, key)
        const hasLeft = Object.hasOwn(leftValue, key)
        const hasRight = Object.hasOwn(rightValue, key)
        if (!hasLeft) {
          addEntry({ path: childPath, kind: 'added', left: undefined, right: rightValue[key] })
        } else if (!hasRight) {
          addEntry({ path: childPath, kind: 'removed', left: leftValue[key], right: undefined })
        } else {
          compare(leftValue[key]!, rightValue[key]!, childPath)
        }
      }
      return
    }

    if (!arePrimitiveValuesEqual(leftValue, rightValue)) {
      addEntry({ path, kind: 'changed', left: leftValue, right: rightValue })
    }
  }

  compare(left, right, '$')
  return { entries, counts, truncated }
}

export function formatDiffValue(value: JsonValue | undefined): string {
  if (value === undefined) return '不存在'
  const formatted = stringifyJson(value, 2)
  return formatted.length > 1_200 ? `${formatted.slice(0, 1_200)}\n… 已截断` : formatted
}

function parseInput(source: string, side: JsonDiffSide): JsonValue {
  try {
    return parseJsonDocument(source).value
  } catch (error) {
    if (error instanceof JsonToolError) throw new JsonDiffInputError(side, error.diagnostic)
    throw error
  }
}

function arePrimitiveValuesEqual(left: JsonValue, right: JsonValue): boolean {
  if (isLosslessNumber(left) && isLosslessNumber(right)) {
    return normalizeJsonNumber(left.toString()) === normalizeJsonNumber(right.toString())
  }
  return left === right
}

function normalizeJsonNumber(source: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(source)
  if (!match) return source

  const sign = match[1] ?? ''
  const fraction = match[3] ?? ''
  let digits = `${match[2] ?? ''}${fraction}`.replace(/^0+/, '')
  if (!digits) return '0'

  const rawExponent = (match[4] ?? '0').replace(/^\+/, '')
  let exponent = BigInt(rawExponent) - BigInt(fraction.length)
  while (digits.endsWith('0')) {
    digits = digits.slice(0, -1)
    exponent += 1n
  }
  return `${sign}${digits}e${exponent}`
}
