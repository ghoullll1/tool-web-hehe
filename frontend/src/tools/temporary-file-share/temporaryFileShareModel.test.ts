import { describe, expect, it } from 'vitest'
import {
  buildShareUrl,
  formatBytes,
  formatCountdown,
  MAX_FILE_BYTES,
  parseCreatedShare,
  parseShareFragment,
  secondsRemaining,
  validateFile,
  normalizePickupCode,
  isPickupCode,
} from './temporaryFileShareModel'

describe('temporary file share model', () => {
  it('keeps credentials in the browser fragment', () => {
    const url = buildShareUrl('https://tool.example', { pickupCode: '01234567' })

    expect(url).toBe('https://tool.example/tools/temporary-file-share#code=01234567')
    expect(parseShareFragment(new URL(url).hash)).toEqual({ pickupCode: '01234567' })
    expect(new URL(url).search).toBe('')
  })

  it('strictly validates the fixed one-download server policy', () => {
    expect(parseCreatedShare({
      pickupCode: '01234567', originalFilename: 'a.txt', sizeBytes: 3,
      sha256: 'hash', expiresAt: '2026-09-14T08:05:00Z', serverTime: '2026-09-14T08:00:00Z', maxDownloads: 1,
    }).originalFilename).toBe('a.txt')
    expect(() => parseCreatedShare({
      pickupCode: '01234567', originalFilename: 'a.txt', sizeBytes: 3,
      sha256: 'hash', expiresAt: '2026-09-14T08:05:00Z', serverTime: '2026-09-14T08:00:00Z', maxDownloads: 2,
    })).toThrow('无法识别的分享策略')
  })

  it('formats size and countdown while rejecting empty files', () => {
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatCountdown(secondsRemaining('2026-09-14T08:05:00Z', Date.parse('2026-09-14T08:03:59Z')))).toBe('01:01')
    expect(validateFile(new File([], 'empty.txt'))).toContain('空文件')
    const oversized = new File(['x'], 'oversized.bin')
    Object.defineProperty(oversized, 'size', { value: MAX_FILE_BYTES + 1 })
    expect(validateFile(oversized)).toBe('单个文件不能超过 30 MB')
  })

  it('preserves leading zeroes and rejects incomplete or legacy credentials', () => {
    expect(normalizePickupCode('０１２３-４５６７')).toBe('01234567')
    expect(isPickupCode('01234567')).toBe(true)
    expect(isPickupCode('1234567')).toBe(false)
    expect(isPickupCode('1234567a')).toBe(false)
    expect(parseShareFragment('#share=id&key=secret')).toBeNull()
    expect(parseShareFragment('#code=123')).toBeNull()
  })
})
