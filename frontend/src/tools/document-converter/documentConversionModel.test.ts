import { describe, expect, it } from 'vitest'
import {
  markdownFilename,
  MAX_DOCUMENT_BYTES,
  parseConvertedDocument,
  profileMarkdown,
  validateDocument,
} from './documentConversionModel'

describe('document conversion model', () => {
  it('accepts supported documents up to and including ten megabytes', () => {
    const file = new File([new Uint8Array(MAX_DOCUMENT_BYTES)], 'report.PDF', { type: 'application/pdf' })
    expect(validateDocument(file)).toBeNull()
  })

  it('rejects unsupported and oversized files before upload', () => {
    expect(validateDocument(new File(['x'], 'archive.zip'))).toContain('暂不支持')
    const oversized = new File([new Uint8Array(MAX_DOCUMENT_BYTES + 1)], 'report.pdf')
    expect(validateDocument(oversized)).toContain('10 MB')
  })

  it('profiles markdown without rendering untrusted HTML', () => {
    expect(profileMarkdown('# Title\n\n[link](https://example.com)\n```js\nx\n```')).toEqual({
      lines: 6, headings: 1, links: 1, codeBlocks: 1, tables: 0,
    })
  })

  it('creates a safe markdown download filename', () => {
    expect(markdownFilename('quarter/report.docx')).toBe('quarter_report.md')
  })

  it('rejects malformed worker responses', () => {
    expect(() => parseConvertedDocument({ markdown: '# missing metadata' })).toThrow('不完整')
    expect(() => parseConvertedDocument({
      schemaVersion: '1.0', requestId: 'r', markdown: '# result',
      source: { filename: 'a.pdf', extension: '.pdf', contentType: 'application/octet-stream', sizeBytes: -1 },
      engine: 'markitdown', engineVersion: null,
      metrics: { durationMs: Number.NaN, markdownCharacters: 8 }, warnings: [],
    })).toThrow('不完整')
  })
})
