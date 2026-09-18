import { describe, expect, it } from 'vitest'
import {
  MAX_HASH_LINES,
  calculateFileHashes,
  calculateTextHashes,
  formatHashBytes,
} from './hashModel'

describe('hashModel', () => {
  it('calculates known UTF-8 digest vectors', () => {
    const result = calculateTextHashes('abc', ['md5', 'sha1', 'sha256', 'sha3-256'], 'digest', '', false)
    expect(result.rows[0]?.digests.md5).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(result.rows[0]?.digests.sha1).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
    expect(result.rows[0]?.digests.sha256).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(result.rows[0]?.digests['sha3-256']).toBe('3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532')
  })

  it('calculates an RFC-compatible HMAC-SHA256 value', () => {
    const result = calculateTextHashes(
      'The quick brown fox jumps over the lazy dog',
      ['sha256'],
      'hmac',
      'key',
      false,
    )
    expect(result.rows[0]?.digests.sha256).toBe('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8')
  })

  it('preserves line numbers and empty lines in per-line mode', () => {
    const result = calculateTextHashes('alpha\n\nbeta', ['sha256'], 'digest', '', true)
    expect(result.rows).toHaveLength(3)
    expect(result.rows[1]?.lineNumber).toBe(2)
    expect(result.rows[1]?.preview).toBe('（空行）')
  })

  it('requires a key for HMAC and caps rendered lines', () => {
    expect(() => calculateTextHashes('abc', ['sha256'], 'hmac', '', false)).toThrow('需要填写密钥')
    const result = calculateTextHashes(Array(MAX_HASH_LINES + 2).fill('x').join('\n'), ['sha256'], 'digest', '', true)
    expect(result.rows).toHaveLength(MAX_HASH_LINES)
    expect(result.truncated).toBe(true)
  })

  it('formats byte counts for file metadata', () => {
    expect(formatHashBytes(1024)).toBe('1.0 KB')
    expect(formatHashBytes(3 * 1024 * 1024)).toBe('3.0 MB')
  })

  it('hashes a file incrementally and reports completion progress', async () => {
    const progress: number[] = []
    const file = Object.assign(new Blob(['abc']), { name: 'sample.txt', lastModified: 0 }) as File
    const result = await calculateFileHashes(file, ['md5', 'sha256'], 'digest', '', (value) => progress.push(value))
    expect(result.digests.md5).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(result.digests.sha256).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(progress.at(-1)).toBe(1)
  })
})
