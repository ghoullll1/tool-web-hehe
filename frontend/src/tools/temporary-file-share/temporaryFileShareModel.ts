export const MAX_FILE_BYTES = 30 * 1024 * 1024
export const FIXED_EXPIRY_MINUTES = 5
export const FIXED_DOWNLOADS = 1

export interface CreatedShare {
  pickupCode: string
  originalFilename: string
  sizeBytes: number
  sha256: string
  expiresAt: string
  serverTime: string
  maxDownloads: number
}

export interface ShareCredentials {
  pickupCode: string
}

export function validateFile(file: File): string | null {
  if (file.size <= 0) return '空文件无法分享，请选择包含内容的文件'
  if (file.size > MAX_FILE_BYTES) return '单个文件不能超过 30 MB'
  return null
}

export function parseCreatedShare(value: unknown): CreatedShare {
  if (!isRecord(value)) throw new Error('服务端返回了无法识别的分享结果')
  const share: CreatedShare = {
    pickupCode: requiredString(value.pickupCode),
    originalFilename: requiredString(value.originalFilename),
    sizeBytes: requiredNumber(value.sizeBytes),
    sha256: requiredString(value.sha256),
    expiresAt: requiredString(value.expiresAt),
    serverTime: requiredString(value.serverTime),
    maxDownloads: requiredNumber(value.maxDownloads),
  }
  if (!isPickupCode(share.pickupCode) || !Number.isFinite(Date.parse(share.expiresAt)) || !Number.isFinite(Date.parse(share.serverTime)) || share.maxDownloads !== FIXED_DOWNLOADS) {
    throw new Error('服务端返回了无法识别的分享策略')
  }
  return share
}

export function buildShareUrl(origin: string, share: ShareCredentials): string {
  const params = new URLSearchParams({ code: share.pickupCode })
  return `${origin}/tools/temporary-file-share#${params.toString()}`
}

export function parseShareFragment(hash: string): ShareCredentials | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const pickupCode = params.get('code') ?? ''
  return isPickupCode(pickupCode) ? { pickupCode } : null
}

export function isPickupCode(value: string): boolean { return /^[0-9]{8}$/.test(value) }

export function normalizePickupCode(value: string): string {
  return value.replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0)).replace(/[\s-]/g, '')
}

export function formatPickupCode(value: string): string { return `${value.slice(0, 4)} ${value.slice(4)}` }

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
  return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MB`
}

export function secondsRemaining(expiresAt: string, now = Date.now()): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000))
}

export function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error('服务端返回了无法识别的分享结果')
  return value
}

function requiredNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('服务端返回了无法识别的分享结果')
  return value
}
