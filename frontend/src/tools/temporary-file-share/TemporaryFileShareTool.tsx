import { Icon } from "../../components/Icon"
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import type { ToolViewProps } from '../registry'
import { createTemporaryShare, downloadTemporaryShare } from './temporaryFileShareApi'
import type { DownloadProgress } from './temporaryFileShareApi'
import {
  buildShareUrl,
  FIXED_DOWNLOADS,
  FIXED_EXPIRY_MINUTES,
  formatBytes,
  formatCountdown,
  formatPickupCode,
  isPickupCode,
  normalizePickupCode,
  MAX_FILE_BYTES,
  parseShareFragment,
  secondsRemaining,
  validateFile,
  type CreatedShare,
  type ShareCredentials,
} from './temporaryFileShareModel'
import './temporaryFileShare.css'

type Mode = 'send' | 'receive'
type NoticeTone = 'info' | 'success' | 'error'

export default function TemporaryFileShareTool({ tool }: ToolViewProps) {
  const initialCredentials = parseShareFragment(window.location.hash)
  const [mode, setMode] = useState<Mode>(initialCredentials ? 'receive' : 'send')
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [created, setCreated] = useState<CreatedShare | null>(null)
  const [credentials, setCredentials] = useState<ShareCredentials>(initialCredentials ?? { pickupCode: '' })
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({ loadedBytes: 0, totalBytes: null, percentage: 0 })
  const [consumed, setConsumed] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [notice, setNotice] = useState({ tone: 'info' as NoticeTone, text: '文件由服务端临时保存，到期后自动失效并清理' })
  const [copied, setCopied] = useState<'link' | 'code' | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const uploadAbort = useRef<AbortController | null>(null)
  const downloadAbort = useRef<AbortController | null>(null)
  const serverClockOffset = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => () => {
    uploadAbort.current?.abort()
    downloadAbort.current?.abort()
    if (copyTimer.current) clearTimeout(copyTimer.current)
  }, [])

  useEffect(() => {
    if (!initialCredentials) return
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    // Credentials remain in component memory but disappear from the address bar after handoff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!created) return
    const tick = () => setSeconds(secondsRemaining(created.expiresAt, Date.now() + serverClockOffset.current))
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [created])

  function chooseFile(candidate: File | null) {
    if (!candidate || uploading) return
    const error = validateFile(candidate)
    if (error) {
      setNotice({ tone: 'error', text: error })
      return
    }
    setFile(candidate)
    setCreated(null)
    setCopied(null)
    setProgress(0)
    setNotice({ tone: 'info', text: '文件已就绪；创建后固定五分钟有效且只能下载一次' })
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    chooseFile(event.dataTransfer.files.item(0))
  }

  async function upload() {
    if (!file || uploading) return
    const controller = new AbortController()
    uploadAbort.current = controller
    setUploading(true)
    setProgress(1)
    setNotice({ tone: 'info', text: '正在加密传输到临时存储，请保持页面打开' })
    try {
      const result = await createTemporaryShare(file, { signal: controller.signal, onProgress: setProgress })
      serverClockOffset.current = Date.parse(result.serverTime) - Date.now()
      setSeconds(secondsRemaining(result.expiresAt, Date.now() + serverClockOffset.current))
      setCreated(result)
      setCopied(null)
      setConsumed(false)
      setCredentials({ pickupCode: result.pickupCode })
      setProgress(100)
      setNotice({ tone: 'success', text: '分享已创建：输入 8 位取件码、扫描二维码或打开链接，任选一种方式接收' })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setNotice({ tone: 'info', text: '上传已取消，文件没有创建分享' })
      } else {
        setNotice({ tone: 'error', text: error instanceof Error ? error.message : '上传失败，请稍后重试' })
      }
      setProgress(0)
    } finally {
      setUploading(false)
      uploadAbort.current = null
    }
  }

  async function copy(value: string, kind: 'link' | 'code') {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(kind)
      const text = kind === 'link'
        ? '分享链接已复制，打开后点击下载即可接收'
        : '8 位取件码已复制'
      setNotice({ tone: 'success', text })
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(null), 1600)
    } catch {
      setNotice({ tone: 'error', text: '复制失败，请检查浏览器剪贴板权限' })
    }
  }

  async function download() {
    if (!isPickupCode(credentials.pickupCode) || downloading || consumed) return
    const controller = new AbortController()
    downloadAbort.current = controller
    setDownloading(true)
    setDownloadProgress({ loadedBytes: 0, totalBytes: null, percentage: null })
    setNotice({ tone: 'info', text: '正在验证取件码并准备下载；成功授权后本次机会会被消耗' })
    try {
      const result = await downloadTemporaryShare(credentials.pickupCode, {
        signal: controller.signal,
        onProgress: setDownloadProgress,
      })
      const href = URL.createObjectURL(result.blob)
      const anchor = document.createElement('a')
      anchor.href = href
      anchor.download = result.filename
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(href), 60_000)
      setConsumed(true)
      setDownloadProgress((current) => ({ ...current, percentage: 100 }))
      setNotice({ tone: 'success', text: `下载已开始${result.sha256 ? '，服务端已附带 SHA-256 校验值' : ''}` })
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setNotice({ tone: 'error', text: error instanceof Error ? error.message : '下载失败，请稍后重试' })
      }
      setDownloadProgress({ loadedBytes: 0, totalBytes: null, percentage: 0 })
    } finally {
      setDownloading(false)
      downloadAbort.current = null
    }
  }

  const shareUrl = created ? buildShareUrl(window.location.origin, created) : ''
  const expired = created !== null && seconds === 0

  return <div className="temporary-share" data-tool={tool.slug}>
    <header className="temporary-share-intro">
      <div className="temporary-share-intro-copy">
        <span className="temporary-share-eyebrow"><i /> EPHEMERAL TRANSFER / 05 MIN TTL</span>
        <h2>交付一次，然后让它消失。</h2>
        <p>一个 8 位取件码，就能跨设备接收文件。也可以扫码或打开链接，五分钟内取走一次。</p>
        <div className="temporary-share-seal"><ShieldCheckIcon /><span><strong>服务端密封交付</strong><small>到期清理 · 授权后即刻失效</small></span></div>
      </div>
      <div className="temporary-vault" role="img" aria-label={`临时文件保险库：${FIXED_EXPIRY_MINUTES} 分钟有效，最多下载 ${FIXED_DOWNLOADS} 次，使用 8 位取件码`}>
        <i className="temporary-vault-ring is-outer" aria-hidden="true" />
        <i className="temporary-vault-ring is-inner" aria-hidden="true" />
        <i className="temporary-vault-orbit-dot" aria-hidden="true" />
        <div className="temporary-vault-core"><span>SEALED</span><SecureFileIcon /><strong>ONE-TIME</strong><small>临时文件舱</small><i /></div>
        <VaultMetric className="is-expiry" value={`${FIXED_EXPIRY_MINUTES}:00`} label="有效窗口" />
        <VaultMetric className="is-downloads" value={`${FIXED_DOWNLOADS}×`} label="下载授权" />
        <VaultMetric className="is-entropy" value="8 位" label="取件码" />
      </div>
    </header>

    <div className="temporary-share-mode" role="tablist" aria-label="文件分享方式">
      <button type="button" role="tab" aria-selected={mode === 'send'} className={mode === 'send' ? 'is-active' : ''} onClick={() => setMode('send')}><span>01</span><strong>发送文件</strong><small>上传并创建一次性分享</small></button>
      <button type="button" role="tab" aria-selected={mode === 'receive'} className={mode === 'receive' ? 'is-active' : ''} onClick={() => setMode('receive')}><span>02</span><strong>接收文件</strong><small>输入 8 位取件码</small></button>
    </div>

    {mode === 'send' ? <section className="temporary-share-workspace is-send" role="tabpanel">
      <div className="temporary-share-card upload-card">
        <SectionHeader index="01" title="选择要交付的文件" detail={`单个文件最大 ${formatBytes(MAX_FILE_BYTES)}`} />
        <div className={`temporary-dropzone${dragging ? ' is-dragging' : ''}${file ? ' has-file' : ''}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={handleDrop}>
          <input ref={fileInput} type="file" aria-label="选择分享文件" onChange={(event) => chooseFile(event.currentTarget.files?.[0] ?? null)} />
          {file ? <>
            <span className="temporary-file-icon" aria-hidden="true">{file.name.split('.').pop()?.slice(0, 4).toUpperCase() || 'FILE'}</span>
            <div><strong title={file.name}>{file.name}</strong><small>{formatBytes(file.size)} · 等待创建安全分享</small></div>
            <button type="button" disabled={uploading} onClick={() => fileInput.current?.click()}>更换文件</button>
          </> : <button type="button" className="temporary-dropzone-action" onClick={() => fileInput.current?.click()}><UploadIcon /><strong>拖入文件，或点击选择</strong><small>文件名会保留，内容不会在页面中预览</small></button>}
        </div>
        <div className="temporary-upload-actions">
          <div><span><b style={{ width: `${progress}%` }} /></span><small>{uploading ? `正在上传 ${progress}%` : file ? '准备完成' : '等待选择文件'}</small></div>
          {uploading ? <button type="button" className="is-secondary" onClick={() => uploadAbort.current?.abort()}>取消上传</button> : <button type="button" className="is-primary" disabled={!file || Boolean(created)} onClick={() => void upload()}><span>{created ? '分享已创建' : '创建临时分享'}</span><i className="temporary-action-icon"><ArrowRightIcon /></i></button>}
        </div>
      </div>

      <div className={`temporary-share-card share-result${created ? ' has-result' : ''}`}>
        <SectionHeader index="02" title="交给接收者" detail="取件码、扫码、链接，三种方式任选" />
        {created ? <div className="temporary-created" aria-live="polite">
          <div className={`temporary-countdown${expired ? ' is-expired' : ''}`}><span>{expired ? '已失效' : '剩余有效时间'}</span><strong>{formatCountdown(seconds)}</strong><small>{expired ? '服务端已拒绝新的下载' : '倒计时由服务端过期时间计算'}</small></div>
          <div className="temporary-pickup-card">
            <span>8 位取件码</span><strong aria-label={`取件码 ${created.pickupCode}`}>{formatPickupCode(created.pickupCode)}</strong>
            <button type="button" disabled={expired} onClick={() => void copy(created.pickupCode, 'code')}>{copied === 'code' ? '已复制' : '复制取件码'}</button>
          </div>
          <div className="temporary-qr-share">
            {expired ? <div className="temporary-qr-expired">二维码已过期</div> : <QRCodeSVG value={shareUrl} size={184} marginSize={4} level="M" bgColor="#ffffff" fgColor="#182432" role="img" title="扫描二维码接收文件" />}
            <div><h4>扫码接收</h4><p>使用手机相机扫描，打开页面后点击下载。电脑接收时直接输入上方取件码。</p><small>二维码在本地生成，不会发送给第三方。</small></div>
          </div>
          <label className="temporary-pickup-link"><span>分享链接</span><input readOnly value={shareUrl} aria-label="分享链接" onFocus={(event) => event.currentTarget.select()} /><button type="button" disabled={expired} onClick={() => void copy(shareUrl, 'link')}>{copied === 'link' ? '已复制' : '复制链接'}</button></label>
          <p className="temporary-code-warning">取件码、二维码与链接拥有相同的取件权限，请只交给接收者。</p>
          <div className="temporary-file-proof"><span>SHA-256</span><code>{created.sha256}</code></div>
        </div> : <div className="temporary-result-empty"><LinkIcon /><strong>取件码与二维码将在这里生成</strong><p>上传完成后，接收者输入 8 位数字即可取件，不再需要分享 ID 或访问密钥。</p><div><span>8 位取件码</span><span>扫码接收</span><span>链接分享</span></div></div>}
      </div>
    </section> : <section className="temporary-share-workspace is-receive" role="tabpanel">
      <div className="temporary-share-card receive-card">
        <SectionHeader index="01" title="解锁一次性文件" detail="可直接打开发送者提供的完整链接" />
        <SecureHandoffVisual state={consumed ? 'complete' : downloading ? 'verifying' : 'idle'} />
        <label className="temporary-code-entry"><span>8 位取件码</span><input value={credentials.pickupCode} inputMode="numeric" autoComplete="off" spellCheck={false} maxLength={16} disabled={downloading} placeholder="例如 5827 1936" aria-describedby="pickup-code-help" onChange={(event) => { setCredentials({ pickupCode: normalizePickupCode(event.target.value) }); setConsumed(false); setDownloadProgress({ loadedBytes: 0, totalBytes: null, percentage: 0 }) }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) void download() }} /></label>
        <p id="pickup-code-help" className="temporary-code-warning">输入发送者提供的 8 位数字；粘贴时支持空格与短横线。也可以使用手机相机扫描分享二维码。</p>
        <DownloadProgressPanel progress={downloadProgress} downloading={downloading} complete={consumed} />
        <button type="button" className={`temporary-download-button${downloading ? ' is-loading' : ''}${consumed ? ' is-complete' : ''}`} disabled={!isPickupCode(credentials.pickupCode) || downloading || consumed} onClick={() => void download()}>
          <span className="temporary-download-button-copy"><strong>{consumed ? '文件已接收' : downloading ? '正在安全接收' : '取件并下载'}</strong><small>{consumed ? '本次下载机会已经使用' : downloading ? '请保持页面打开' : '验证通过后立即开始一次性下载'}</small></span>
          <i className="temporary-download-button-icon"><DownloadActionIcon state={consumed ? 'complete' : downloading ? 'loading' : 'ready'} /></i>
        </button>
      </div>
      <aside className="temporary-share-card receive-guide">
        <SectionHeader index="02" title="下载前请确认" detail="一次授权，不可重放" />
        <ol><li><span>01</span><div><strong>仅从可信联系人获取</strong><p>链接拥有者可以发起唯一一次下载。</p></div></li><li><span>02</span><div><strong>下载即消耗机会</strong><p>服务端授权成功后，同一链接无法再次使用。</p></div></li><li><span>03</span><div><strong>按未知文件处理</strong><p>本站强制附件下载，不预览、不执行文件内容。</p></div></li></ol>
      </aside>
    </section>}

    <footer className={`temporary-share-notice is-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}><span>{notice.tone === 'error' ? <Icon name="alert" /> : notice.tone === 'success' ? <Icon name="check" /> : <Icon name="info" />}</span><p>{notice.text}</p><b>固定 5 分钟 · 最多下载 1 次</b></footer>
  </div>
}

function VaultMetric({ className, value, label }: { className: string; value: string; label: string }) { return <div className={`temporary-vault-metric ${className}`}><strong>{value}</strong><small>{label}</small></div> }
function SectionHeader({ index, title, detail }: { index: string; title: string; detail: string }) { return <header className="temporary-section-header"><span>{index}</span><div><h3>{title}</h3><p>{detail}</p></div></header> }
function DownloadProgressPanel({ progress, downloading, complete }: { progress: DownloadProgress; downloading: boolean; complete: boolean }) {
  const indeterminate = downloading && progress.percentage === null
  const percentage = complete ? 100 : progress.percentage ?? 0
  const status = complete ? '下载完成' : downloading ? (indeterminate ? '正在接收' : `${percentage}%`) : '等待开始'
  const detail = progress.loadedBytes > 0
    ? `${formatBytes(progress.loadedBytes)}${progress.totalBytes ? ` / ${formatBytes(progress.totalBytes)}` : ' 已接收'}`
    : '验证通过后将显示实时下载进度'

  return <div
    className={`temporary-download-progress${downloading ? ' is-active' : ''}${complete ? ' is-complete' : ''}`}
    role="progressbar"
    aria-label="文件接收进度"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={indeterminate ? undefined : percentage}
    aria-valuetext={status}
  >
    <div><span>文件接收进度</span><strong>{status}</strong></div>
    <span className="temporary-download-track" aria-hidden="true"><i className={indeterminate ? 'is-indeterminate' : ''} style={indeterminate ? undefined : { width: `${percentage}%` }} /></span>
    <small>{detail}</small>
  </div>
}
function SecureHandoffVisual({ state }: { state: 'idle' | 'verifying' | 'complete' }) {
  const stateText = state === 'complete' ? '授权完成' : state === 'verifying' ? '正在验证' : '等待验证'
  return <div className={`temporary-receive-visual is-${state}`} role="img" aria-label={`访问凭证到一次性文件：${stateText}`}>
    <div className="temporary-receive-node is-key"><span><CredentialIcon /></span><small>访问凭证</small></div>
    <div className="temporary-receive-route" aria-hidden="true">
      <i className="temporary-receive-route-track" />
      <i className="temporary-receive-route-signal" />
      <b><ShieldCheckIcon /><span>{stateText}</span></b>
    </div>
    <div className="temporary-receive-node is-file"><span><SecureFileIcon /></span><small>一次性文件</small></div>
  </div>
}
function ArrowRightIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13m-5-5 5 5-5 5" /></svg> }
function DownloadActionIcon({ state }: { state: 'ready' | 'loading' | 'complete' }) {
  if (state === 'loading') return <svg className="is-spinner" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /></svg>
  if (state === 'complete') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9" /></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v10m0 0 4-4m-4 4-4-4M5 18h14" /></svg>
}
function CredentialIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="10" r="3.5" /><path d="m11.2 11.3 7.8 7.8m-2.4-2.4 1.8-1.8m-4.2-.6 1.8-1.8" /></svg> }
function ShieldCheckIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 19 6v5.1c0 4.3-2.8 7.7-7 9.4-4.2-1.7-7-5.1-7-9.4V6l7-2.5Z" /><path d="m8.8 11.8 2.1 2.1 4.4-4.5" /></svg> }
function SecureFileIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h6l4 4V20H7zM13 3.5V8h4" /><path d="M9.5 14.5h5m-5 2.8h3.6" /></svg> }
function UploadIcon() { return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 32V11m0 0-8 8m8-8 8 8M9 29v8a3 3 0 0 0 3 3h24a3 3 0 0 0 3-3v-8" /></svg> }
function LinkIcon() { return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M19 29l10-10m-5-6 3-3a8 8 0 0 1 11 11l-4 4M24 35l-3 3a8 8 0 0 1-11-11l4-4" /></svg> }
