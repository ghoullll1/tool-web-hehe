import { describe, expect, it } from 'vitest'
import {
  CoordinateInputError,
  convertBatch,
  convertCoordinate,
  convertToAll,
  formatCoordinate,
  parseCoordinate,
  serializeBatch,
} from './coordinateModel'

describe('coordinateModel', () => {
  it('parses both coordinate orders and validates ranges', () => {
    expect(parseCoordinate('116.397128, 39.916527', 'lng-lat')).toEqual({ lng: 116.397128, lat: 39.916527 })
    expect(parseCoordinate('39.916527 116.397128', 'lat-lng')).toEqual({ lng: 116.397128, lat: 39.916527 })
    expect(() => parseCoordinate('181, 39', 'lng-lat')).toThrow('经度')
  })

  it('converts Beijing WGS84 into distinct GCJ-02 and BD-09 coordinates', () => {
    const source = { lng: 116.397128, lat: 39.916527 }
    const all = convertToAll(source, 'wgs84')
    expect(all.gcj02.lng).toBeGreaterThan(116.4)
    expect(all.gcj02.lat).toBeGreaterThan(39.91)
    expect(all.bd09.lng).toBeGreaterThan(all.gcj02.lng)
    expect(all.bd09.lat).toBeGreaterThan(all.gcj02.lat)
  })

  it('round-trips WGS84 and GCJ-02 within sub-meter coordinate tolerance', () => {
    const source = { lng: 116.397128, lat: 39.916527 }
    const gcj = convertCoordinate(source, 'wgs84', 'gcj02')
    const restored = convertCoordinate(gcj, 'gcj02', 'wgs84')
    expect(restored.lng).toBeCloseTo(source.lng, 6)
    expect(restored.lat).toBeCloseTo(source.lat, 6)
  })

  it('leaves WGS84 outside China unchanged when converting to GCJ-02', () => {
    const paris = { lng: 2.3522, lat: 48.8566 }
    expect(convertCoordinate(paris, 'wgs84', 'gcj02')).toEqual(paris)
  })

  it('converts labeled batches and reports the offending source line', () => {
    const rows = convertBatch('天安门 广场,116.397128,39.916527\n121.4737,31.2304', 'wgs84', 'gcj02', 'lng-lat')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.label).toBe('天安门 广场')
    expect(serializeBatch(rows, 'lat-lng', 6).split('\n')[0]).toMatch(/^天安门 广场,\d+\.\d{6}, \d+\.\d{6}$/)

    try {
      convertBatch('116,39\ninvalid', 'wgs84', 'gcj02', 'lng-lat')
      throw new Error('Expected a batch error')
    } catch (error) {
      expect(error).toBeInstanceOf(CoordinateInputError)
      expect((error as CoordinateInputError).line).toBe(2)
    }
  })

  it('neutralizes spreadsheet formulas in exported labels', () => {
    const rows = convertBatch('=cmd,116.397128,39.916527', 'wgs84', 'gcj02', 'lng-lat')
    expect(serializeBatch(rows, 'lng-lat', 6)).toMatch(/^'=cmd,/)
  })

  it('formats coordinates with explicit precision and order', () => {
    expect(formatCoordinate({ lng: 116.3, lat: 39.9 }, 'lng-lat', 6)).toBe('116.300000, 39.900000')
    expect(formatCoordinate({ lng: 116.3, lat: 39.9 }, 'lat-lng', 4)).toBe('39.9000, 116.3000')
  })
})
