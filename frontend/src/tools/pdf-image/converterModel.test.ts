import { describe, expect, it } from 'vitest'
import { imagePlacement, validateFiles } from './converterModel'

describe('image conversion layout', () => {
  it('fits portrait and landscape images inside A4 margins without cropping', () => {
    for (const [width, height] of [[4000, 1000], [1000, 4000]]) {
      const result = imagePlacement(width!, height!, { paper: 'a4', landscape: false, margin: 24 })
      expect(result.width / result.height).toBeCloseTo(width! / height!)
      expect(result.x).toBeGreaterThanOrEqual(24)
      expect(result.y).toBeGreaterThanOrEqual(24)
      expect(result.width + result.x).toBeLessThanOrEqual(result.pageWidth - 24 + .001)
    }
  })
  it('uses 96 DPI image dimensions for original-size pages', () => {
    expect(imagePlacement(800, 600, { paper: 'original', landscape: false, margin: 0 })).toEqual({ pageWidth: 600, pageHeight: 450, width: 600, height: 450, x: 0, y: 0 })
  })
  it('rejects unsupported, empty, and oversized inputs', () => {
    expect(() => validateFiles([], 'pdf')).toThrow()
    expect(() => validateFiles([{ name: 'a.svg', size: 10 } as File], 'images')).toThrow()
    expect(() => validateFiles([{ name: 'a.pdf', size: 101 * 1024 * 1024 } as File], 'pdf')).toThrow()
  })
})
