import { parseConvertedDocument, type ConvertedDocument } from './documentConversionModel'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export interface ConversionRequestOptions {
  signal?: AbortSignal
  onUploadProgress?: (percentage: number) => void
  onUploadComplete?: () => void
}

export function convertDocument(
  file: File,
  options: ConversionRequestOptions = {},
): Promise<ConvertedDocument> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    const abort = () => request.abort()
    const detachAbort = () => options.signal?.removeEventListener('abort', abort)
    if (options.signal?.aborted) {
      reject(new DOMException('转换已取消', 'AbortError'))
      return
    }

    request.open('POST', `${API_BASE_URL}/api/v1/document-conversions`)
    request.setRequestHeader('Accept', 'application/json')
    request.responseType = 'json'
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        options.onUploadProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)))
      }
    })
    request.upload.addEventListener('load', () => options.onUploadComplete?.())
    request.addEventListener('load', () => {
      detachAbort()
      if (request.status >= 200 && request.status < 300) {
        try {
          resolve(parseConvertedDocument(request.response))
        } catch (error) {
          reject(error)
        }
        return
      }
      reject(new Error(problemDetail(request.response, `转换失败（HTTP ${request.status}）`)))
    })
    request.addEventListener('error', () => {
      detachAbort()
      reject(new Error('无法连接文档转换服务，请稍后重试。'))
    })
    request.addEventListener('abort', () => {
      detachAbort()
      reject(new DOMException('转换已取消', 'AbortError'))
    })
    options.signal?.addEventListener('abort', abort, { once: true })

    const body = new FormData()
    body.append('file', file)
    request.send(body)
  })
}

function problemDetail(value: unknown, fallback: string) {
  if (!value || typeof value !== 'object') return fallback
  const problem = value as { detail?: unknown; title?: unknown }
  if (typeof problem.detail === 'string' && problem.detail) return problem.detail
  if (typeof problem.title === 'string' && problem.title) return problem.title
  return fallback
}
