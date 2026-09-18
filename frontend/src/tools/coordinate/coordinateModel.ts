export type CoordinateSystem = 'wgs84' | 'gcj02' | 'bd09'
export type CoordinateOrder = 'lng-lat' | 'lat-lng'

export interface Coordinate {
  lng: number
  lat: number
}

export interface CoordinateSystemDefinition {
  id: CoordinateSystem
  label: string
  maps: string
  description: string
}

export interface BatchCoordinateResult {
  line: number
  label: string
  source: Coordinate
  target: Coordinate
}

export const MAX_BATCH_ROWS = 1000
export const MAX_COORDINATE_TEXT_BYTES = 512 * 1024

export const COORDINATE_SYSTEMS: readonly CoordinateSystemDefinition[] = Object.freeze([
  { id: 'wgs84', label: 'WGS84', maps: 'GPS / Google 海外', description: '全球卫星定位常用标准坐标' },
  { id: 'gcj02', label: 'GCJ-02', maps: '高德 / 腾讯 / Google 中国', description: '中国大陆道路地图常用坐标' },
  { id: 'bd09', label: 'BD-09', maps: '百度地图', description: '百度经纬度坐标（BD09LL）' },
])

const SYSTEM_MAP = new Map(COORDINATE_SYSTEMS.map((system) => [system.id, system]))
const PI = Math.PI
const X_PI = (PI * 3000) / 180
const AXIS = 6378245
const ECCENTRICITY = 0.006693421622965943

export class CoordinateInputError extends Error {
  constructor(message: string, public readonly line?: number) {
    super(message)
    this.name = 'CoordinateInputError'
  }
}

export function getCoordinateSystem(id: CoordinateSystem): CoordinateSystemDefinition {
  const system = SYSTEM_MAP.get(id)
  if (!system) throw new Error(`未配置的坐标系：${id}`)
  return system
}

export function parseCoordinate(text: string, order: CoordinateOrder): Coordinate {
  const parts = text.trim().split(/[\s,，]+/).filter(Boolean)
  if (parts.length !== 2) throw new CoordinateInputError('请输入一组坐标，例如 116.397128, 39.916527')
  const first = Number(parts[0])
  const second = Number(parts[1])
  if (!Number.isFinite(first) || !Number.isFinite(second)) throw new CoordinateInputError('经纬度必须是有效数字')
  return validateCoordinate(order === 'lng-lat' ? { lng: first, lat: second } : { lng: second, lat: first })
}

export function validateCoordinate(coordinate: Coordinate): Coordinate {
  if (coordinate.lng < -180 || coordinate.lng > 180) throw new CoordinateInputError('经度必须在 -180 到 180 之间')
  if (coordinate.lat < -90 || coordinate.lat > 90) throw new CoordinateInputError('纬度必须在 -90 到 90 之间')
  return coordinate
}

export function formatCoordinate(coordinate: Coordinate, order: CoordinateOrder, precision: number): string {
  const lng = coordinate.lng.toFixed(precision)
  const lat = coordinate.lat.toFixed(precision)
  return order === 'lng-lat' ? `${lng}, ${lat}` : `${lat}, ${lng}`
}

export function convertCoordinate(
  coordinate: Coordinate,
  source: CoordinateSystem,
  target: CoordinateSystem,
): Coordinate {
  validateCoordinate(coordinate)
  if (source === target) return { ...coordinate }

  const gcj = source === 'wgs84'
    ? wgs84ToGcj02(coordinate)
    : source === 'bd09'
      ? bd09ToGcj02(coordinate)
      : coordinate

  if (target === 'gcj02') return gcj
  return target === 'wgs84' ? gcj02ToWgs84(gcj) : gcj02ToBd09(gcj)
}

export function convertToAll(
  coordinate: Coordinate,
  source: CoordinateSystem,
): Record<CoordinateSystem, Coordinate> {
  return {
    wgs84: convertCoordinate(coordinate, source, 'wgs84'),
    gcj02: convertCoordinate(coordinate, source, 'gcj02'),
    bd09: convertCoordinate(coordinate, source, 'bd09'),
  }
}

export function convertBatch(
  sourceText: string,
  sourceSystem: CoordinateSystem,
  targetSystem: CoordinateSystem,
  inputOrder: CoordinateOrder,
): BatchCoordinateResult[] {
  const bytes = new TextEncoder().encode(sourceText).length
  if (bytes > MAX_COORDINATE_TEXT_BYTES) throw new CoordinateInputError('批量内容不能超过 512 KB')
  const lines = sourceText.split(/\r?\n/)
  const rows: BatchCoordinateResult[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]?.trim() ?? ''
    if (!raw) continue
    if (rows.length >= MAX_BATCH_ROWS) throw new CoordinateInputError(`一次最多转换 ${MAX_BATCH_ROWS} 个坐标`)
    const commaParts = raw.includes(',') || raw.includes('，')
      ? raw.split(/[,，]/).map((part) => part.trim())
      : raw.split(/\s+/)
    const hasLabel = commaParts.length === 3 && !Number.isFinite(Number(commaParts[0]))
    if ((!hasLabel && commaParts.length !== 2) || (hasLabel && commaParts.length !== 3) || commaParts.some((part) => !part)) {
      throw new CoordinateInputError('格式应为“经度,纬度”或“名称,经度,纬度”', index + 1)
    }
    try {
      const values = hasLabel ? commaParts.slice(1) : commaParts
      const coordinate = parseCoordinate(values.join(','), inputOrder)
      rows.push({
        line: index + 1,
        label: hasLabel ? commaParts[0] ?? '' : '',
        source: coordinate,
        target: convertCoordinate(coordinate, sourceSystem, targetSystem),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '坐标格式错误'
      throw new CoordinateInputError(message, index + 1)
    }
  }

  if (rows.length === 0) throw new CoordinateInputError('请至少输入一组坐标')
  return rows
}

export function serializeBatch(
  rows: readonly BatchCoordinateResult[],
  order: CoordinateOrder,
  precision: number,
): string {
  return rows.map((row) => {
    const value = formatCoordinate(row.target, order, precision)
    return row.label ? `${escapeCsvCell(row.label)},${value}` : value
  }).join('\n')
}

function escapeCsvCell(value: string): string {
  const formulaSafe = /^[=+\-@]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(formulaSafe) ? `"${formulaSafe.replace(/"/g, '""')}"` : formulaSafe
}

export function approximateOffsetMeters(a: Coordinate, b: Coordinate): number {
  const radius = 6371008.8
  const lat1 = (a.lat * PI) / 180
  const lat2 = (b.lat * PI) / 180
  const deltaLat = ((b.lat - a.lat) * PI) / 180
  const deltaLng = ((b.lng - a.lng) * PI) / 180
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

export function isOutsideChinaBounds({ lng, lat }: Coordinate): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271
}

function transformLat(lng: number, lat: number): number {
  let result = -100 + 2 * lng + 3 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng))
  result += ((20 * Math.sin(6 * lng * PI) + 20 * Math.sin(2 * lng * PI)) * 2) / 3
  result += ((20 * Math.sin(lat * PI) + 40 * Math.sin((lat / 3) * PI)) * 2) / 3
  result += ((160 * Math.sin((lat / 12) * PI) + 320 * Math.sin((lat * PI) / 30)) * 2) / 3
  return result
}

function transformLng(lng: number, lat: number): number {
  let result = 300 + lng + 2 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng))
  result += ((20 * Math.sin(6 * lng * PI) + 20 * Math.sin(2 * lng * PI)) * 2) / 3
  result += ((20 * Math.sin(lng * PI) + 40 * Math.sin((lng / 3) * PI)) * 2) / 3
  result += ((150 * Math.sin((lng / 12) * PI) + 300 * Math.sin((lng / 30) * PI)) * 2) / 3
  return result
}

function wgs84ToGcj02(coordinate: Coordinate): Coordinate {
  if (isOutsideChinaBounds(coordinate)) return { ...coordinate }
  let deltaLat = transformLat(coordinate.lng - 105, coordinate.lat - 35)
  let deltaLng = transformLng(coordinate.lng - 105, coordinate.lat - 35)
  const radLat = (coordinate.lat / 180) * PI
  let magic = Math.sin(radLat)
  magic = 1 - ECCENTRICITY * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  deltaLat = (deltaLat * 180) / (((AXIS * (1 - ECCENTRICITY)) / (magic * sqrtMagic)) * PI)
  deltaLng = (deltaLng * 180) / ((AXIS / sqrtMagic) * Math.cos(radLat) * PI)
  return { lng: coordinate.lng + deltaLng, lat: coordinate.lat + deltaLat }
}

function gcj02ToWgs84(coordinate: Coordinate): Coordinate {
  if (isOutsideChinaBounds(coordinate)) return { ...coordinate }
  let minLng = coordinate.lng - 0.01
  let maxLng = coordinate.lng + 0.01
  let minLat = coordinate.lat - 0.01
  let maxLat = coordinate.lat + 0.01
  let candidate = { ...coordinate }
  for (let index = 0; index < 30; index += 1) {
    candidate = { lng: (minLng + maxLng) / 2, lat: (minLat + maxLat) / 2 }
    const transformed = wgs84ToGcj02(candidate)
    const deltaLng = transformed.lng - coordinate.lng
    const deltaLat = transformed.lat - coordinate.lat
    if (Math.max(Math.abs(deltaLng), Math.abs(deltaLat)) < 1e-7) return candidate
    if (deltaLng > 0) maxLng = candidate.lng
    else minLng = candidate.lng
    if (deltaLat > 0) maxLat = candidate.lat
    else minLat = candidate.lat
  }
  return candidate
}

function gcj02ToBd09(coordinate: Coordinate): Coordinate {
  const z = Math.sqrt(coordinate.lng ** 2 + coordinate.lat ** 2) + 0.00002 * Math.sin(coordinate.lat * X_PI)
  const theta = Math.atan2(coordinate.lat, coordinate.lng) + 0.000003 * Math.cos(coordinate.lng * X_PI)
  return { lng: z * Math.cos(theta) + 0.0065, lat: z * Math.sin(theta) + 0.006 }
}

function bd09ToGcj02(coordinate: Coordinate): Coordinate {
  const lng = coordinate.lng - 0.0065
  const lat = coordinate.lat - 0.006
  const z = Math.sqrt(lng ** 2 + lat ** 2) - 0.00002 * Math.sin(lat * X_PI)
  const theta = Math.atan2(lat, lng) - 0.000003 * Math.cos(lng * X_PI)
  return { lng: z * Math.cos(theta), lat: z * Math.sin(theta) }
}
