import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
} from 'react'
import type { ToolViewProps } from '../registry'
import { MAX_JSON_BYTES, formatBytes, formatJson } from '../json-formatter/jsonModel'
import {
  JsonDiffInputError,
  compareJsonDocuments,
  formatDiffValue,
  type JsonDiffKind,
  type JsonDiffResult,
  type JsonDiffSide,
} from './jsonDiffModel'

const LEFT_SAMPLE = `{
  "service": "orders",
  "version": 1,
  "enabled": true,
  "limits": {
    "timeout": 30,
    "retries": 2
  },
  "tags": ["stable", "public"],
  "owner": {
    "team": "platform"
  }
}`

const RIGHT_SAMPLE = `{
  "service": "orders",
  "version": 2,
  "region": "cn-east",
  "limits": {
    "timeout": 45,
    "retries": 2
  },
  "tags": ["stable", "internal", "v2"],
  "owner": {
    "team": "platform"
  }
}`

type Notice = { tone: 'success' | 'error' | 'neutral'; message: string }

export default function JsonDiffTool({ tool }: ToolViewProps) {
  const [leftSource, setLeftSource] = useState(LEFT_SAMPLE)
  const [rightSource, setRightSource] = useState(RIGHT_SAMPLE)
  const [result, setResult] = useState<JsonDiffResult | null>(() => compareJsonDocuments(LEFT_SAMPLE, RIGHT_SAMPLE))
  const [activeDiffIndex, setActiveDiffIndex] = useState(0)
  const [notice, setNotice] = useState<Notice>({ tone: 'success', message: '示例对比完成，差异已按 JSONPath 对齐' })
  const leftFileInputRef = useRef<HTMLInputElement>(null)
  const rightFileInputRef = useRef<HTMLInputElement>(null)
  const diffListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const activeRow = diffListRef.current
      ?.querySelector<HTMLElement>(`[data-diff-index="${activeDiffIndex}"]`)
    activeRow?.scrollIntoView?.({ block: 'nearest' })
  }, [activeDiffIndex, result])

  function runCompare(nextLeft = leftSource, nextRight = rightSource, successMessage?: string) {
    try {
      const nextResult = compareJsonDocuments(nextLeft, nextRight)
      setResult(nextResult)
      setActiveDiffIndex(0)
      setNotice({
        tone: 'success',
        message: successMessage ?? (nextResult.entries.length === 0
          ? '两份 JSON 的数据内容完全一致'
          : `对比完成，共发现 ${nextResult.entries.length} 处差异`),
      })
    } catch (error) {
      setResult(null)
      setActiveDiffIndex(0)
      if (error instanceof JsonDiffInputError) {
        const sideName = error.side === 'left' ? '原始 JSON' : '目标 JSON'
        setNotice({
          tone: 'error',
          message: `${sideName}：${error.message}（第 ${error.diagnostic.line} 行，第 ${error.diagnostic.column} 列）`,
        })
        return
      }
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : 'JSON 对比失败' })
    }
  }

  function updateSource(side: JsonDiffSide, value: string) {
    if (side === 'left') setLeftSource(value)
    else setRightSource(value)
    setResult(null)
    setActiveDiffIndex(0)
    setNotice({ tone: 'neutral', message: '内容已修改，点击“开始对比”生成新的差异结果' })
  }

  function formatInputs() {
    try {
      const nextLeft = formatJson(leftSource, '\t')
      const nextRight = formatJson(rightSource, '\t')
      setLeftSource(nextLeft)
      setRightSource(nextRight)
      runCompare(nextLeft, nextRight, '两侧 JSON 已格式化并重新对比')
    } catch {
      runCompare(leftSource, rightSource)
    }
  }

  function swapInputs() {
    setLeftSource(rightSource)
    setRightSource(leftSource)
    runCompare(rightSource, leftSource, '原始 JSON 与目标 JSON 已交换')
  }

  function loadExample() {
    setLeftSource(LEFT_SAMPLE)
    setRightSource(RIGHT_SAMPLE)
    runCompare(LEFT_SAMPLE, RIGHT_SAMPLE, '示例已载入并完成对比')
  }

  function clearInputs() {
    setLeftSource('')
    setRightSource('')
    setResult(null)
    setActiveDiffIndex(0)
    setNotice({ tone: 'neutral', message: '两侧内容已清空' })
  }

  function handlePaste(side: JsonDiffSide, event: ClipboardEvent<HTMLTextAreaElement>) {
    event.preventDefault()
    const currentSource = side === 'left' ? leftSource : rightSource
    const editor = event.currentTarget
    const pastedText = event.clipboardData.getData('text')
    const start = editor.selectionStart ?? currentSource.length
    const end = editor.selectionEnd ?? start
    const nextSource = `${currentSource.slice(0, start)}${pastedText}${currentSource.slice(end)}`
    const nextLeft = side === 'left' ? nextSource : leftSource
    const nextRight = side === 'right' ? nextSource : rightSource
    if (side === 'left') setLeftSource(nextSource)
    else setRightSource(nextSource)
    runCompare(nextLeft, nextRight, `${side === 'left' ? '原始' : '目标'} JSON 已粘贴并自动对比`)
  }

  async function loadFile(side: JsonDiffSide, file: File | undefined) {
    if (!file) return
    if (file.size > MAX_JSON_BYTES) {
      setResult(null)
      setNotice({ tone: 'error', message: `${file.name} 超过 ${formatBytes(MAX_JSON_BYTES)} 的处理上限` })
      return
    }

    try {
      const content = await file.text()
      const nextLeft = side === 'left' ? content : leftSource
      const nextRight = side === 'right' ? content : rightSource
      if (side === 'left') setLeftSource(content)
      else setRightSource(content)
      runCompare(nextLeft, nextRight, `${file.name} 已载入并自动对比`)
    } catch {
      setNotice({ tone: 'error', message: `${file.name} 读取失败，请重新选择` })
    }
  }

  function handleFileChange(side: JsonDiffSide, event: ChangeEvent<HTMLInputElement>) {
    void loadFile(side, event.target.files?.[0])
    event.target.value = ''
  }

  function moveActiveDiff(direction: -1 | 1) {
    const count = result?.entries.length ?? 0
    if (count < 2) return
    setActiveDiffIndex((current) => (current + direction + count) % count)
  }

  const entryCount = result?.entries.length ?? 0
  const displayEntries = useMemo(() => result?.entries.map((entry) => ({
    ...entry,
    leftText: formatDiffValue(entry.left),
    rightText: formatDiffValue(entry.right),
  })) ?? [], [result])

  return (
    <div className="json-diff-tool">
      <div className="json-diff-toolbar" aria-label={`${tool.displayName}操作栏`}>
        <button className="is-primary" type="button" onClick={() => runCompare()}>开始对比</button>
        <button type="button" onClick={formatInputs}>格式化两侧</button>
        <button type="button" onClick={swapInputs}>交换</button>
        <button type="button" onClick={loadExample}>示例</button>
        <button type="button" onClick={clearInputs}>清空</button>
        <span>仅在浏览器本地处理</span>
      </div>

      <div className={`json-diff-notice is-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
        <span aria-hidden="true">{notice.tone === 'success' ? '✓' : notice.tone === 'error' ? '!' : 'i'}</span>
        <p>{notice.message}</p>
      </div>

      <div className="json-diff-input-grid">
        <DiffInputPanel
          index="01"
          title="原始 JSON"
          value={leftSource}
          fileInputRef={leftFileInputRef}
          onChange={(value) => updateSource('left', value)}
          onPaste={(event) => handlePaste('left', event)}
          onFile={(file) => void loadFile('left', file)}
          onFileChange={(event) => handleFileChange('left', event)}
        />
        <DiffInputPanel
          index="02"
          title="目标 JSON"
          value={rightSource}
          fileInputRef={rightFileInputRef}
          onChange={(value) => updateSource('right', value)}
          onPaste={(event) => handlePaste('right', event)}
          onFile={(file) => void loadFile('right', file)}
          onFileChange={(event) => handleFileChange('right', event)}
        />
      </div>

      <section className="json-diff-result-panel">
        <header className="json-diff-result-header">
          <div className="json-diff-result-title">
            <span className="json-panel-index">03</span>
            <h2>差异结果</h2>
          </div>
          {result && (
            <div className="json-diff-summary" aria-label="差异统计">
              <span className="is-added">+ {result.counts.added} 新增</span>
              <span className="is-removed">− {result.counts.removed} 删除</span>
              <span className="is-changed">~ {result.counts.changed} 修改</span>
            </div>
          )}
          <div className="json-diff-navigation" aria-label="差异导航">
            <button type="button" onClick={() => moveActiveDiff(-1)} disabled={entryCount < 2} aria-label="上一个差异">↑</button>
            <output>{entryCount === 0 ? '0 / 0' : `${activeDiffIndex + 1} / ${entryCount}`}</output>
            <button type="button" onClick={() => moveActiveDiff(1)} disabled={entryCount < 2} aria-label="下一个差异">↓</button>
          </div>
        </header>

        <div className="json-diff-column-header" aria-hidden="true">
          <span>路径</span><span>原始值</span><span>目标值</span>
        </div>
        <div className="json-diff-list" ref={diffListRef}>
          {!result && <EmptyDiff title="等待对比" detail="在两侧粘贴 JSON，或点击“开始对比”。" />}
          {result && result.entries.length === 0 && <EmptyDiff title="内容一致" detail="忽略缩进和字段顺序后，没有发现数据差异。" success />}
          {displayEntries.map((entry, index) => (
            <button
              className={`json-diff-row is-${entry.kind}${index === activeDiffIndex ? ' is-active' : ''}`}
              type="button"
              key={`${entry.kind}-${entry.path}`}
              data-diff-index={index}
              aria-label={`${kindLabel(entry.kind)} ${entry.path}`}
              aria-current={index === activeDiffIndex ? 'true' : undefined}
              onClick={() => setActiveDiffIndex(index)}
            >
              <span className="json-diff-path"><b>{kindSymbol(entry.kind)}</b><code>{entry.path}</code></span>
              <code className={`json-diff-value is-left is-${entry.kind}${entry.left === undefined ? ' is-missing' : ''}`}>
                {entry.leftText}
              </code>
              <code className={`json-diff-value is-right is-${entry.kind}${entry.right === undefined ? ' is-missing' : ''}`}>
                {entry.rightText}
              </code>
            </button>
          ))}
          {result?.truncated && <p className="json-diff-truncated">差异较多，仅展示前 500 项。</p>}
        </div>
      </section>
    </div>
  )
}

function DiffInputPanel({
  index,
  title,
  value,
  fileInputRef,
  onChange,
  onPaste,
  onFile,
  onFileChange,
}: {
  index: string
  title: string
  value: string
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onChange: (value: string) => void
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void
  onFile: (file: File | undefined) => void
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void
}) {
  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    onFile(event.dataTransfer.files[0])
  }

  return (
    <section className="json-diff-input-panel" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
      <header>
        <div><span className="json-panel-index">{index}</span><h2>{title}</h2></div>
        <button type="button" onClick={() => fileInputRef.current?.click()}>打开文件</button>
        <input ref={fileInputRef} type="file" accept=".json,application/json,text/plain" aria-label={`${title}文件`} hidden onChange={onFileChange} />
      </header>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onPaste={onPaste}
        spellCheck={false}
        aria-label={`${title}输入`}
        placeholder={`粘贴${title}，或拖入 .json 文件…`}
      />
      <footer><span>{value.length.toLocaleString()} 字符</span><span>{formatBytes(new TextEncoder().encode(value).length)}</span></footer>
    </section>
  )
}

function EmptyDiff({ title, detail, success = false }: { title: string; detail: string; success?: boolean }) {
  return (
    <div className={`json-diff-empty${success ? ' is-success' : ''}`}>
      <span aria-hidden="true">{success ? '✓' : '≠'}</span>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  )
}

function kindLabel(kind: JsonDiffKind) {
  return kind === 'added' ? '新增' : kind === 'removed' ? '删除' : '修改'
}

function kindSymbol(kind: JsonDiffKind) {
  return kind === 'added' ? '+' : kind === 'removed' ? '−' : '~'
}
