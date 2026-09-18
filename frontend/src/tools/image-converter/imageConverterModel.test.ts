// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  convertedImageName,
  convertImage,
  formatImageBytes,
  formatSizeDelta,
  outputDimensions,
  validateImageFiles,
} from './imageConverterModel'

afterEach(() => vi.restoreAllMocks())

describe('imageConverterModel', () => {
  it('validates the supported browser image formats and limits', () => {
    expect(() => validateImageFiles([])).toThrow('请选择')
    expect(() => validateImageFiles([new File(['x'], 'vector.svg', { type: 'image/svg+xml' })])).toThrow('不是支持的')
    expect(() => validateImageFiles([new File([], 'empty.png', { type: 'image/png' })])).toThrow('空文件')
    expect(() => validateImageFiles([new File(['x'], 'photo.JPG')])).not.toThrow()
  })

  it('calculates output dimensions and rejects oversized images', () => {
    expect(outputDimensions(1200, 800, 0.5)).toEqual({ width: 600, height: 400 })
    expect(outputDimensions(1, 1, 0.5)).toEqual({ width: 1, height: 1 })
    expect(() => outputDimensions(20_000, 1, 1)).toThrow('单边不能超过')
    expect(() => outputDimensions(10_000, 5_000, 1)).toThrow('像素不能超过')
  })

  it('builds safe output labels and readable size summaries', () => {
    expect(convertedImageName('holiday.photo.png', 'webp')).toBe('holiday.photo-converted.webp')
    expect(convertedImageName('photo.jpg', 'jpeg', 2)).toBe('photo-converted-2.jpg')
    expect(formatImageBytes(1024)).toBe('1.0 KB')
    expect(formatSizeDelta(1000, 400)).toBe('减小 60%')
    expect(formatSizeDelta(1000, 1200)).toBe('增加 20%')
  })

  it('fills JPEG transparency and exports at the requested scale', async () => {
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 800, height: 600, close })))
    const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn(), imageSmoothingEnabled: false, imageSmoothingQuality: 'low' }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => callback(new Blob(['jpg'], { type: type ?? 'image/jpeg' })))

    const result = await convertImage(new File(['source'], 'sample.png', { type: 'image/png' }), {
      format: 'jpeg', quality: 88, scale: 0.5, background: '#f6f0e4',
    })

    expect(result).toMatchObject({ name: 'sample-converted.jpg', width: 400, height: 300 })
    expect(context.fillStyle).toBe('#f6f0e4')
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 400, 300)
    expect(context.drawImage).toHaveBeenCalled()
    expect(close).toHaveBeenCalled()
  })

  it('reports unsupported browser encoders and closes the bitmap', async () => {
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 120, height: 80, close })))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['fallback'], { type: 'image/png' })))

    await expect(convertImage(new File(['source'], 'sample.jpg', { type: 'image/jpeg' }), {
      format: 'webp', quality: 85, scale: 1, background: '#ffffff',
    })).rejects.toThrow('不支持 WEBP')
    expect(close).toHaveBeenCalled()
  })
})
