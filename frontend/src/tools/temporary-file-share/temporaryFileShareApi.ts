import { parseCreatedShare, type CreatedShare } from './temporaryFileShareModel'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export interface UploadOptions {
  signal?: AbortSignal
  onProgress?: (percentage: number) => void
}

export interface DownloadProgress {
  loadedBytes: number
  totalBytes: number | null
  percentage: number | null
}

export interface DownloadOptions {
  signal?: AbortSignal
  onProgress?: (progress: DownloadProgress) => void
}

export function createTemporaryShare(file: File, options: UploadOptions = {}): Promise<CreatedShare> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    const abort = () => request.abort()
    const detachAbort = () => options.signal?.removeEventListener('abort', abort)
    if (options.signal?.aborted) {
      reject(new DOMException('上传已取消', 'AbortError'))
      return
    }
    request.open('POST', `${API_BASE_URL}/api/v1/file-shares`)
    request.setRequestHeader('Accept', 'application/json')
    request.responseType = 'json'
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) options.onProgress?.(Math.round((event.loaded / event.total) * 100))
    })
    request.addEventListener('load', () => {
      detachAbort()
      if (request.status >= 200 && request.status < 300) {
        try {
          resolve(parseCreatedShare(request.response))
        } catch (error) {
          reject(error)
        }
        return
      }
      reject(new Error(problemDetail(request.response, `上传失败（HTTP ${request.status}）`)))
    })
    request.addEventListener('error', () => {
      detachAbort()
      reject(new Error('无法连接文件分享服务，请稍后重试'))
    })
    request.addEventListener('abort', () => {
      detachAbort()
      reject(new DOMException('上传已取消', 'AbortError'))
    })
    options.signal?.addEventListener('abort', abort, { once: true })

    const body = new FormData()
    body.append('file', file)
    request.send(body)
  })
}

export async function downloadTemporaryShare(
  shareId: string,
  accessKey: string,
  options: DownloadOptions = {},
): Promise<{ blob: Blob; filename: string; sha256: string | null }> {
  const response = await fetch(`${API_BASE_URL}/api/v1/file-shares/${encodeURIComponent(shareId)}/download`, {
    method: 'POST',
    headers: { Accept: 'application/octet-stream', 'X-Share-Key': accessKey },
    cache: 'no-store',
    credentials: 'omit',
    signal: options.signal,
  })
  if (!response.ok) {
    let detail = `下载失败（HTTP ${response.status}）`
    try {
      detail = problemDetail(await response.json(), detail)
    } catch {
      // Keep status fallback for intermediary HTML or empty responses.
    }
    throw new Error(detail)
  }
  const declaredLength = Number(response.headers.get('Content-Length'))
  const totalBytes = Number.isFinite(declaredLength) && declaredLength > 0 ? declaredLength : null
  let loadedBytes = 0
  let blob: Blob
  options.onProgress?.({ loadedBytes, totalBytes, percentage: totalBytes ? 0 : null })

  if (response.body) {
    const reader = response.body.getReader()
    const chunks: BlobPart[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(Uint8Array.from(value))
      loadedBytes += value.byteLength
      options.onProgress?.({
        loadedBytes,
        totalBytes,
        percentage: totalBytes ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100)) : null,
      })
    }
    blob = new Blob(chunks, { type: response.headers.get('Content-Type') ?? 'application/octet-stream' })
  } else {
    blob = await response.blob()
    loadedBytes = blob.size
  }
  options.onProgress?.({ loadedBytes, totalBytes, percentage: 100 })

  return {
    blob,
    filename: filenameFromDisposition(response.headers.get('Content-Disposition')),
    sha256: response.headers.get('X-File-Sha256'),
  }
}

function problemDetail(value: unknown, fallback: string): string {
  if (!value || typeof value !== 'object') return fallback
  const problem = value as { detail?: unknown; title?: unknown }
  if (typeof problem.detail === 'string' && problem.detail) return problem.detail
  if (typeof problem.title === 'string' && problem.title) return problem.title
  return fallback
}

function filenameFromDisposition(disposition: string | null): string {
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (encoded) {
    try { return decodeURIComponent(encoded) } catch { /* fall through */ }
  }
  const plain = disposition?.match(/filename="?([^";]+)"?/i)?.[1]
  return plain?.trim() || 'shared-file'
}
