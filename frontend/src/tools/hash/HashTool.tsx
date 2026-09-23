import { Icon, type IconName } from "../../components/Icon"
import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react'
import type { ToolViewProps } from '../registry'
import {
  HASH_ALGORITHMS,
  MAX_HASH_TEXT_BYTES,
  calculateFileHashes,
  calculateTextHashes,
  formatHashBytes,
  getAlgorithm,
  type FileHashResult,
  type HashAlgorithmId,
  type HashMode,
  type TextHashResult,
} from './hashModel'

const SAMPLE_TEXT = 'The quick brown fox jumps over the lazy dog'
type InputMode = 'text' | 'file'
type Notice = { tone: 'neutral' | 'success' | 'error'; message: string }

export default function HashTool({ tool }: ToolViewProps) {
  const [mode, setMode] = useState<HashMode>('digest')
  const [inputMode, setInputMode] = useState<InputMode>('text')
  const [source, setSource] = useState(SAMPLE_TEXT)
  const [keyValue, setKeyValue] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [perLine, setPerLine] = useState(false)
  const [uppercase, setUppercase] = useState(false)
  const [selectedIds, setSelectedIds] = useState<HashAlgorithmId[]>(['sha256'])
  const [file, setFile] = useState<File | null>(null)
  const [fileResult, setFileResult] = useState<FileHashResult | null>(null)
  const [fileProgress, setFileProgress] = useState(0)
  const [fileBusy, setFileBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>({ tone: 'success', message: '示例文本已使用 SHA-256 实时计算' })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileJobRef = useRef(0)

  const orderedSelectedIds = useMemo(
    () => HASH_ALGORITHMS.filter(({ id }) => selectedIds.includes(id)).map(({ id }) => id),
    [selectedIds],
  )

  const textCalculation = useMemo<{ result: TextHashResult | null; error: string | null }>(() => {
    if (!source) return { result: null, error: null }
    try {
      return { result: calculateTextHashes(source, orderedSelectedIds, mode, keyValue, perLine), error: null }
    } catch (error) {
      return { result: null, error: error instanceof Error ? error.message : '哈希计算失败' }
    }
  }, [keyValue, mode, orderedSelectedIds, perLine, source])

  const hasLegacySelection = orderedSelectedIds.some((id) => getAlgorithm(id).family === 'legacy')
  const activeResult = inputMode === 'text' ? textCalculation.result : fileResult
  const activeError = inputMode === 'text'
    ? textCalculation.error ?? (notice.tone === 'error' ? notice.message : null)
    : notice.tone === 'error' ? notice.message : null

  function invalidateFileResult(message?: string) {
    fileJobRef.current += 1
    setFileBusy(false)
    setFileProgress(0)
    setFileResult(null)
    if (message) setNotice({ tone: 'neutral', message })
  }

  function chooseMode(nextMode: HashMode) {
    setMode(nextMode)
    invalidateFileResult(nextMode === 'hmac' ? 'HMAC 模式会将密钥与输入共同计算' : '已切换为普通哈希模式')
  }

  function chooseInputMode(nextMode: InputMode) {
    if (nextMode === inputMode) return
    if (nextMode === 'text' && fileBusy) invalidateFileResult('已停止文件计算并切换到文本输入')
    else setNotice({ tone: 'neutral', message: `已切换到${nextMode === 'text' ? '文本' : '文件'}输入` })
    setInputMode(nextMode)
  }

  function updateSource(value: string) {
    setSource(value)
    if (notice.tone === 'error') setNotice({ tone: 'neutral', message: '文本内容已更新' })
  }

  function toggleAlgorithm(id: HashAlgorithmId) {
    if (selectedIds.includes(id) && selectedIds.length === 1) {
      setNotice({ tone: 'error', message: '请至少保留一种哈希算法' })
      return
    }
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
    invalidateFileResult('算法选择已更新')
  }

  function selectRecommended() {
    setSelectedIds(['sha256', 'sha512', 'sha3-256'])
    invalidateFileResult('已选择常用安全算法')
  }

  async function hashFile(target = file) {
    if (!target) {
      setNotice({ tone: 'error', message: '请先选择需要计算的文件' })
      return
    }
    const jobId = ++fileJobRef.current
    setFileBusy(true)
    setFileProgress(0)
    setFileResult(null)
    setNotice({ tone: 'neutral', message: `正在分块读取 ${target.name}…` })
    try {
      const result = await calculateFileHashes(
        target,
        orderedSelectedIds,
        mode,
        keyValue,
        (progress) => { if (fileJobRef.current === jobId) setFileProgress(progress) },
        () => fileJobRef.current !== jobId,
      )
      if (fileJobRef.current !== jobId) return
      setFileResult(result)
      setNotice({ tone: 'success', message: `${target.name} 计算完成，用时 ${Math.max(1, Math.round(result.elapsedMs))} ms` })
    } catch (error) {
      if (fileJobRef.current !== jobId) return
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : '文件哈希计算失败' })
    } finally {
      if (fileJobRef.current === jobId) setFileBusy(false)
    }
  }

  function acceptFile(nextFile: File | undefined) {
    if (!nextFile) return
    setFile(nextFile)
    setFileResult(null)
    setNotice({ tone: 'neutral', message: `${nextFile.name} 已就绪，正在开始计算` })
    void hashFile(nextFile)
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    acceptFile(event.target.files?.[0])
    event.target.value = ''
  }

  function clearInput() {
    invalidateFileResult()
    if (inputMode === 'text') {
      setSource('')
      setNotice({ tone: 'neutral', message: '文本已清空' })
    } else {
      setFile(null)
      setNotice({ tone: 'neutral', message: '文件已移除' })
    }
  }

  async function copyText(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value)
      setNotice({ tone: 'success', message })
    } catch {
      setNotice({ tone: 'error', message: '复制失败，请检查浏览器剪贴板权限' })
    }
  }

  function copyAll() {
    const lines: string[] = []
    if (inputMode === 'text' && textCalculation.result) {
      textCalculation.result.rows.forEach((row) => {
        orderedSelectedIds.forEach((id) => {
          const prefix = row.lineNumber ? `L${row.lineNumber} ` : ''
          lines.push(`${prefix}${modeLabel(mode, getAlgorithm(id).label)}: ${formatDigest(row.digests[id], uppercase)}`)
        })
      })
    } else if (fileResult) {
      orderedSelectedIds.forEach((id) => lines.push(`${modeLabel(mode, getAlgorithm(id).label)}: ${formatDigest(fileResult.digests[id], uppercase)}`))
    }
    if (lines.length) void copyText(lines.join('\n'), `已复制 ${lines.length} 条结果`)
  }

  const shownNotice: Notice = activeError
    ? { tone: 'error', message: activeError }
    : activeResult
      ? { tone: 'success', message: inputMode === 'text' ? '输入内容已实时计算' : notice.message }
      : notice

  return (
    <div className="hash-tool" data-tool={tool.slug}>
      <div className={`hash-notice is-${shownNotice.tone}`} role={shownNotice.tone === 'error' ? 'alert' : 'status'}>
        <span aria-hidden="true">{shownNotice.tone === 'error' ? <Icon name="alert" /> : shownNotice.tone === 'success' ? <Icon name="check" /> : <Icon name="info" />}</span>
        <p>{shownNotice.message}</p>
        <b>仅在浏览器本地处理</b>
      </div>

      <section className="hash-config" aria-label="哈希计算设置">
        <header className="hash-config-header">
          <div className="hash-mode-switch" aria-label="计算类型">
            <button type="button" className={mode === 'digest' ? 'is-active' : ''} aria-pressed={mode === 'digest'} onClick={() => chooseMode('digest')}>普通哈希</button>
            <button type="button" className={mode === 'hmac' ? 'is-active' : ''} aria-pressed={mode === 'hmac'} onClick={() => chooseMode('hmac')}>HMAC 签名</button>
          </div>
          <div className="hash-config-actions">
            <span>已选 {selectedIds.length} 项</span>
            <button type="button" onClick={selectRecommended}>选择常用算法</button>
          </div>
        </header>

        <div className="hash-algorithm-groups">
          <AlgorithmGroup title="推荐算法" ids={HASH_ALGORITHMS.filter((item) => item.family === 'recommended').map((item) => item.id)} selectedIds={selectedIds} mode={mode} onToggle={toggleAlgorithm} />
          <AlgorithmGroup title="兼容算法" ids={HASH_ALGORITHMS.filter((item) => item.family === 'legacy').map((item) => item.id)} selectedIds={selectedIds} mode={mode} legacy onToggle={toggleAlgorithm} />
        </div>

        {mode === 'hmac' && (
          <div className="hash-key-row">
            <label htmlFor="hash-secret">HMAC 密钥</label>
            <div>
              <input id="hash-secret" type={showKey ? 'text' : 'password'} value={keyValue} autoComplete="off" spellCheck={false} placeholder="输入签名密钥" onChange={(event) => { setKeyValue(event.target.value); invalidateFileResult('密钥已修改') }} />
              <button type="button" onClick={() => setShowKey((current) => !current)} aria-label={showKey ? '隐藏密钥' : '显示密钥'}>{showKey ? '隐藏' : '显示'}</button>
            </div>
            <small>密钥不会离开当前浏览器。</small>
          </div>
        )}

        {hasLegacySelection && (
          <p className="hash-legacy-warning" role="note"><strong>兼容性提示：</strong>MD5、SHA-1 与 RIPEMD-160 不适合新的安全协议，仅用于历史系统校验。</p>
        )}
      </section>

      <div className="hash-workspace">
        <section className="hash-panel hash-input-panel" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (inputMode === 'file') acceptFile(event.dataTransfer.files[0]) }}>
          <header className="hash-panel-header">
            <div><span>01</span><h2>输入</h2></div>
            <div className="hash-panel-actions">
              <div className="hash-input-switch" aria-label="输入方式">
                <button type="button" className={inputMode === 'text' ? 'is-active' : ''} aria-pressed={inputMode === 'text'} onClick={() => chooseInputMode('text')}>文本</button>
                <button type="button" className={inputMode === 'file' ? 'is-active' : ''} aria-pressed={inputMode === 'file'} onClick={() => chooseInputMode('file')}>文件</button>
              </div>
              <button type="button" onClick={clearInput}>清空</button>
            </div>
          </header>

          {inputMode === 'text' ? (
            <>
              <textarea aria-label="待计算文本" value={source} maxLength={MAX_HASH_TEXT_BYTES} spellCheck={false} placeholder="输入或粘贴需要计算哈希的文本…" onChange={(event) => updateSource(event.target.value)} />
              <footer className="hash-input-footer">
                <label><input type="checkbox" checked={perLine} onChange={(event) => setPerLine(event.target.checked)} /><span>按行独立计算</span></label>
                <span>{source.length.toLocaleString()} 字符</span>
                <span>{formatHashBytes(new TextEncoder().encode(source).length)}</span>
                <span>UTF-8</span>
              </footer>
            </>
          ) : (
            <FileInput file={file} progress={fileProgress} busy={fileBusy} fileInputRef={fileInputRef} onChoose={() => fileInputRef.current?.click()} onChange={handleFileChange} onDrop={acceptFile} onRecalculate={() => void hashFile()} />
          )}
        </section>

        <section className="hash-panel hash-result-panel">
          <header className="hash-panel-header">
            <div><span>02</span><h2>计算结果</h2></div>
            <div className="hash-panel-actions">
              <div className="hash-case-switch" aria-label="字母大小写">
                <button type="button" className={!uppercase ? 'is-active' : ''} aria-pressed={!uppercase} onClick={() => setUppercase(false)}>小写</button>
                <button type="button" className={uppercase ? 'is-active' : ''} aria-pressed={uppercase} onClick={() => setUppercase(true)}>大写</button>
              </div>
              <button type="button" disabled={!activeResult} onClick={copyAll}>复制全部</button>
            </div>
          </header>
          <div className="hash-results">
            {inputMode === 'text' && <TextResults result={textCalculation.result} error={textCalculation.error} selectedIds={orderedSelectedIds} uppercase={uppercase} mode={mode} onCopy={copyText} />}
            {inputMode === 'file' && <FileResults file={file} result={fileResult} busy={fileBusy} selectedIds={orderedSelectedIds} uppercase={uppercase} mode={mode} onCopy={copyText} />}
          </div>
          <footer className="hash-result-footer">
            <span>{selectedIds.length} 种算法</span>
            <span>{mode === 'hmac' ? 'HMAC' : '摘要'}</span>
            <span>{inputMode === 'file' ? '分块读取' : perLine ? '逐行模式' : '整段模式'}</span>
          </footer>
        </section>
      </div>
    </div>
  )
}

function AlgorithmGroup({ title, ids, selectedIds, mode, legacy = false, onToggle }: { title: string; ids: HashAlgorithmId[]; selectedIds: HashAlgorithmId[]; mode: HashMode; legacy?: boolean; onToggle: (id: HashAlgorithmId) => void }) {
  return (
    <div className={`hash-algorithm-group${legacy ? ' is-legacy' : ''}`}>
      <h3>{title}</h3>
      <div>
        {ids.map((id) => {
          const algorithm = getAlgorithm(id)
          const selected = selectedIds.includes(id)
          return <button type="button" key={id} className={selected ? 'is-selected' : ''} aria-label={`选择算法 ${modeLabel(mode, algorithm.label)}`} aria-pressed={selected} onClick={() => onToggle(id)}><span>{selected ? <Icon name="check" /> : <Icon name="plus" />}</span>{modeLabel(mode, algorithm.label)}</button>
        })}
      </div>
    </div>
  )
}

function FileInput({ file, progress, busy, fileInputRef, onChoose, onChange, onDrop, onRecalculate }: { file: File | null; progress: number; busy: boolean; fileInputRef: React.RefObject<HTMLInputElement | null>; onChoose: () => void; onChange: (event: ChangeEvent<HTMLInputElement>) => void; onDrop: (file: File | undefined) => void; onRecalculate: () => void }) {
  function handleDrop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); onDrop(event.dataTransfer.files[0]) }
  return (
    <div className="hash-file-area" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
      <input ref={fileInputRef} type="file" hidden aria-label="选择哈希文件" onChange={onChange} />
      <div className="hash-file-icon" aria-hidden="true"><Icon name="file" size={28} /></div>
      {file ? <><strong>{file.name}</strong><p>{formatHashBytes(file.size)} · {file.type || '未知类型'}</p></> : <><strong>拖入文件开始计算</strong><p>采用 4 MB 分块读取，不会上传文件。</p></>}
      <div className="hash-file-buttons">
        <button type="button" onClick={onChoose}>{file ? '更换文件' : '选择文件'}</button>
        {file && <button type="button" disabled={busy} onClick={onRecalculate}>重新计算</button>}
      </div>
      {(busy || progress > 0) && <div className="hash-progress" aria-label={`计算进度 ${Math.round(progress * 100)}%`}><i style={{ width: `${progress * 100}%` }} /></div>}
      {busy && <span className="hash-progress-label">正在计算 {Math.round(progress * 100)}%</span>}
    </div>
  )
}

function TextResults({ result, error, selectedIds, uppercase, mode, onCopy }: { result: TextHashResult | null; error: string | null; selectedIds: HashAlgorithmId[]; uppercase: boolean; mode: HashMode; onCopy: (value: string, message: string) => void }) {
  if (error) return <ResultEmpty symbol="alert" title="暂时无法计算" detail={error} error />
  if (!result) return <ResultEmpty symbol="hash" title="等待输入" detail="输入文本后，结果会在这里实时更新。" />
  return (
    <div className="hash-result-list">
      {result.rows.map((row, index) => (
        <article className="hash-result-group" key={row.lineNumber ?? index}>
          {row.lineNumber && <header><span>L{row.lineNumber}</span><p title={row.preview}>{row.preview}</p></header>}
          <div>
            {selectedIds.map((id) => <DigestCard key={id} id={id} digest={row.digests[id]} uppercase={uppercase} mode={mode} onCopy={onCopy} />)}
          </div>
        </article>
      ))}
      {result.truncated && <p className="hash-truncated">行数较多，仅展示并计算前 500 行。</p>}
    </div>
  )
}

function FileResults({ file, result, busy, selectedIds, uppercase, mode, onCopy }: { file: File | null; result: FileHashResult | null; busy: boolean; selectedIds: HashAlgorithmId[]; uppercase: boolean; mode: HashMode; onCopy: (value: string, message: string) => void }) {
  if (busy) return <ResultEmpty symbol="refresh" title="正在分块计算" detail="大文件会逐块读取，页面仍可继续响应。" />
  if (!file) return <ResultEmpty symbol="hash" title="等待文件" detail="切换到左侧文件输入，选择或拖入一个文件。" />
  if (!result) return <ResultEmpty symbol="refresh" title="等待重新计算" detail="算法或密钥已改变，请重新计算文件。" />
  return <div className="hash-result-list"><article className="hash-result-group"><header><span>FILE</span><p title={file.name}>{file.name}</p></header><div>{selectedIds.map((id) => <DigestCard key={id} id={id} digest={result.digests[id]} uppercase={uppercase} mode={mode} onCopy={onCopy} />)}</div></article></div>
}

function DigestCard({ id, digest, uppercase, mode, onCopy }: { id: HashAlgorithmId; digest: string | undefined; uppercase: boolean; mode: HashMode; onCopy: (value: string, message: string) => void }) {
  const label = modeLabel(mode, getAlgorithm(id).label)
  const value = formatDigest(digest, uppercase)
  return (
    <div className="hash-digest-card">
      <div><strong>{label}</strong></div>
      <code>{value}</code>
      <button type="button" aria-label={`复制 ${label}`} onClick={() => onCopy(value, `${label} 已复制`)}>复制</button>
    </div>
  )
}

function ResultEmpty({ symbol, title, detail, error = false }: { symbol: IconName; title: string; detail: string; error?: boolean }) {
  return <div className={`hash-result-empty${error ? ' is-error' : ''}`}><span aria-hidden="true"><Icon name={symbol} size={28} /></span><strong>{title}</strong><p>{detail}</p></div>
}

function modeLabel(mode: HashMode, algorithmLabel: string) {
  return mode === 'hmac' ? `HMAC-${algorithmLabel}` : algorithmLabel
}

function formatDigest(value: string | undefined, uppercase: boolean) {
  if (!value) return '—'
  return uppercase ? value.toUpperCase() : value
}
