import { describe, expect, it } from 'vitest'
import {
  CHINESE_WORDS,
  DEFAULT_PASSPHRASE_OPTIONS,
  DEFAULT_PASSWORD_OPTIONS,
  DEFAULT_TOKEN_OPTIONS,
  ENGLISH_WORDS,
  generatePassphrase,
  generatePassword,
  generateSecrets,
  generateToken,
  strengthForEntropy,
  type RandomSource,
} from './passwordGeneratorModel'

function sequenceRandom(seed = 0): RandomSource {
  let value = seed
  return { integer(maxExclusive) { const result = value % maxExclusive; value += 1; return result } }
}

describe('passwordGeneratorModel', () => {
  it('generates a password containing every enabled character group', () => {
    const result = generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length: 16, avoidAmbiguous: false }, sequenceRandom())
    expect(result.value).toHaveLength(16)
    expect(result.value).toMatch(/[a-z]/)
    expect(result.value).toMatch(/[A-Z]/)
    expect(result.value).toMatch(/[0-9]/)
    expect([...result.value].some((character) => '!@#$%^&*()-_=+[]{}:,.?'.includes(character))).toBe(true)
    expect(result.entropy).toBeGreaterThan(90)
  })

  it('excludes ambiguous characters and rejects unusable settings', () => {
    const result = generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length: 128, symbols: false, avoidAmbiguous: true }, sequenceRandom())
    expect(result.value).not.toMatch(/[Il1O0o]/)
    expect(() => generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, lowercase: false, uppercase: false, digits: false, symbols: false }, sequenceRandom())).toThrow('至少选择')
    expect(() => generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length: 129 }, sequenceRandom())).toThrow('4 到 128')
  })

  it('creates API, Base64URL, hex, and RFC-shaped UUID tokens', () => {
    const apiKey = generateToken({ ...DEFAULT_TOKEN_OPTIONS, format: 'api-key', prefix: 'ci_test_', bits: 128 }, sequenceRandom())
    const base64url = generateToken({ ...DEFAULT_TOKEN_OPTIONS, format: 'base64url', bits: 192 }, sequenceRandom())
    const hex = generateToken({ ...DEFAULT_TOKEN_OPTIONS, format: 'hex', bits: 256 }, sequenceRandom())
    const uuid = generateToken({ ...DEFAULT_TOKEN_OPTIONS, format: 'uuid' }, sequenceRandom())
    expect(apiKey.value).toMatch(/^ci_test_[A-Za-z0-9]+$/)
    expect(base64url.value).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(hex.value).toMatch(/^[0-9a-f]{64}$/)
    expect(uuid.value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(uuid.entropy).toBe(122)
  })

  it('builds readable passphrases from unique local word lists', () => {
    expect(new Set(ENGLISH_WORDS).size).toBe(ENGLISH_WORDS.length)
    expect(new Set(CHINESE_WORDS).size).toBe(CHINESE_WORDS.length)
    expect(ENGLISH_WORDS.length).toBeGreaterThanOrEqual(128)
    expect(CHINESE_WORDS.length).toBeGreaterThanOrEqual(100)

    const english = generatePassphrase({ ...DEFAULT_PASSPHRASE_OPTIONS, wordCount: 4, separator: '.', casing: 'title', includeNumber: false }, sequenceRandom())
    const chinese = generatePassphrase({ ...DEFAULT_PASSPHRASE_OPTIONS, wordCount: 4, language: 'chinese', separator: '-', includeNumber: true }, sequenceRandom())
    expect(english.value.split('.')).toHaveLength(4)
    expect(english.value).toMatch(/^[A-Z][a-z]+\./)
    expect(chinese.value.split('-')).toHaveLength(4)
    expect(chinese.value).toMatch(/\d{2}$/)
  })

  it('generates the configured batch size and maps entropy to clear strength bands', () => {
    const results = generateSecrets('token', DEFAULT_PASSWORD_OPTIONS, { ...DEFAULT_TOKEN_OPTIONS, count: 12 }, DEFAULT_PASSPHRASE_OPTIONS, sequenceRandom())
    expect(results).toHaveLength(12)
    expect(strengthForEntropy(40).label).toBe('基础')
    expect(strengthForEntropy(60).label).toBe('良好')
    expect(strengthForEntropy(90).label).toBe('强')
    expect(strengthForEntropy(128).label).toBe('极强')
  })
})
