import { hmac } from '@noble/hashes/hmac.js'
import { md5, ripemd160, sha1 } from '@noble/hashes/legacy.js'
import { sha224, sha256, sha384, sha512 } from '@noble/hashes/sha2.js'
import { sha3_224, sha3_256, sha3_384, sha3_512 } from '@noble/hashes/sha3.js'
import { bytesToHex, utf8ToBytes, type CHash } from '@noble/hashes/utils.js'

export const MAX_HASH_TEXT_BYTES = 2 * 1024 * 1024
export const MAX_HASH_LINES = 500
export const FILE_HASH_CHUNK_BYTES = 4 * 1024 * 1024

export type HashMode = 'digest' | 'hmac'
export type HashAlgorithmId =
  | 'md5'
  | 'sha1'
  | 'sha224'
  | 'sha256'
  | 'sha384'
  | 'sha512'
  | 'sha3-224'
  | 'sha3-256'
  | 'sha3-384'
  | 'sha3-512'
  | 'ripemd160'

export interface HashAlgorithmDefinition {
  id: HashAlgorithmId
  label: string
  family: 'recommended' | 'legacy'
  hash: CHash
}

export interface TextHashRow {
  lineNumber?: number
  preview: string
  digests: Record<HashAlgorithmId, string | undefined>
}

export interface TextHashResult {
  byteLength: number
  rows: TextHashRow[]
  truncated: boolean
}

export interface FileHashResult {
  byteLength: number
  elapsedMs: number
  digests: Record<HashAlgorithmId, string | undefined>
}

export const HASH_ALGORITHMS: readonly HashAlgorithmDefinition[] = Object.freeze([
  { id: 'sha256', label: 'SHA-256', family: 'recommended', hash: sha256 },
  { id: 'sha512', label: 'SHA-512', family: 'recommended', hash: sha512 },
  { id: 'sha384', label: 'SHA-384', family: 'recommended', hash: sha384 },
  { id: 'sha224', label: 'SHA-224', family: 'recommended', hash: sha224 },
  { id: 'sha3-256', label: 'SHA3-256', family: 'recommended', hash: sha3_256 },
  { id: 'sha3-512', label: 'SHA3-512', family: 'recommended', hash: sha3_512 },
  { id: 'sha3-384', label: 'SHA3-384', family: 'recommended', hash: sha3_384 },
  { id: 'sha3-224', label: 'SHA3-224', family: 'recommended', hash: sha3_224 },
  { id: 'md5', label: 'MD5', family: 'legacy', hash: md5 },
  { id: 'sha1', label: 'SHA-1', family: 'legacy', hash: sha1 },
  { id: 'ripemd160', label: 'RIPEMD-160', family: 'legacy', hash: ripemd160 },
])

const ALGORITHM_MAP = new Map(HASH_ALGORITHMS.map((algorithm) => [algorithm.id, algorithm]))

export function calculateTextHashes(
  source: string,
  algorithmIds: readonly HashAlgorithmId[],
  mode: HashMode,
  key: string,
  perLine: boolean,
): TextHashResult {
  assertSelection(algorithmIds)
  const sourceBytes = utf8ToBytes(source)
  if (sourceBytes.length > MAX_HASH_TEXT_BYTES) {
    throw new Error(`文本超过 ${formatHashBytes(MAX_HASH_TEXT_BYTES)} 的处理上限`)
  }
  if (mode === 'hmac' && key.length === 0) throw new Error('HMAC 模式需要填写密钥')

  const lines = perLine ? source.split(/\r?\n/) : null
  const inputs = lines ? lines.slice(0, MAX_HASH_LINES) : [source]
  return {
    byteLength: sourceBytes.length,
    rows: inputs.map((input, index) => ({
      lineNumber: perLine ? index + 1 : undefined,
      preview: previewText(input),
      digests: calculateBytes(utf8ToBytes(input), algorithmIds, mode, key),
    })),
    truncated: Boolean(lines && lines.length > MAX_HASH_LINES),
  }
}

export async function calculateFileHashes(
  file: File,
  algorithmIds: readonly HashAlgorithmId[],
  mode: HashMode,
  key: string,
  onProgress: (progress: number) => void = () => undefined,
  isCancelled: () => boolean = () => false,
): Promise<FileHashResult> {
  assertSelection(algorithmIds)
  if (mode === 'hmac' && key.length === 0) throw new Error('HMAC 模式需要填写密钥')

  const digesters = createDigesters(algorithmIds, mode, key)
  const startedAt = performance.now()
  try {
    if (file.size === 0) onProgress(1)
    for (let offset = 0; offset < file.size; offset += FILE_HASH_CHUNK_BYTES) {
      if (isCancelled()) throw new Error('HASH_CANCELLED')
      const buffer = await file.slice(offset, offset + FILE_HASH_CHUNK_BYTES).arrayBuffer()
      const chunk = new Uint8Array(buffer)
      digesters.forEach((digester) => digester.update(chunk))
      onProgress(Math.min(1, (offset + chunk.length) / file.size))
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }

    const digests = emptyDigestRecord()
    digesters.forEach((digester, id) => { digests[id] = bytesToHex(digester.digest()) })
    return { byteLength: file.size, elapsedMs: performance.now() - startedAt, digests }
  } finally {
    digesters.forEach((digester) => {
      try { digester.destroy() } catch { /* finalized instances may already be destroyed */ }
    })
  }
}

export function getAlgorithm(id: HashAlgorithmId): HashAlgorithmDefinition {
  const algorithm = ALGORITHM_MAP.get(id)
  if (!algorithm) throw new Error(`不支持的哈希算法：${id}`)
  return algorithm
}

export function formatHashBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function calculateBytes(
  input: Uint8Array,
  algorithmIds: readonly HashAlgorithmId[],
  mode: HashMode,
  key: string,
) {
  const digests = emptyDigestRecord()
  const keyBytes = utf8ToBytes(key)
  for (const id of algorithmIds) {
    const algorithm = getAlgorithm(id)
    digests[id] = bytesToHex(mode === 'hmac'
      ? hmac(algorithm.hash, keyBytes, input)
      : algorithm.hash(input))
  }
  return digests
}

function createDigesters(algorithmIds: readonly HashAlgorithmId[], mode: HashMode, key: string) {
  const keyBytes = utf8ToBytes(key)
  return new Map(algorithmIds.map((id) => {
    const algorithm = getAlgorithm(id)
    return [id, mode === 'hmac' ? hmac.create(algorithm.hash, keyBytes) : algorithm.hash.create()] as const
  }))
}

function assertSelection(algorithmIds: readonly HashAlgorithmId[]) {
  if (algorithmIds.length === 0) throw new Error('请至少选择一种哈希算法')
  algorithmIds.forEach(getAlgorithm)
}

function emptyDigestRecord(): Record<HashAlgorithmId, string | undefined> {
  return Object.create(null) as Record<HashAlgorithmId, string | undefined>
}

function previewText(value: string) {
  if (value.length === 0) return '（空行）'
  const normalized = value.replace(/\t/g, '⇥')
  return normalized.length > 72 ? `${normalized.slice(0, 69)}…` : normalized
}
