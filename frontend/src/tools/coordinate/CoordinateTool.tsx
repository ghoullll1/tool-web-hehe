import { Icon } from "../../components/Icon"
import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import type { ToolViewProps } from '../registry'
import {
  COORDINATE_SYSTEMS,
  CoordinateInputError,
  MAX_COORDINATE_TEXT_BYTES,
  approximateOffsetMeters,
  convertBatch,
  convertToAll,
  formatCoordinate,
  getCoordinateSystem,
  parseCoordinate,
  serializeBatch,
  type BatchCoordinateResult,
  type CoordinateOrder,
  type CoordinateSystem,
} from './coordinateModel'

type ViewMode = 'single' | 'batch'
type Notice = { tone: 'neutral' | 'success' | 'error'; message: string }

const SINGLE_SAMPLE = '116.397128, 39.916527'
const BATCH_SAMPLE = '天安门,116.397128,39.916527\n外滩,121.490317,31.241701\n广州塔,113.324553,23.106414'

function SystemCards({ label, value, onChange }: {
  label: string
  value: CoordinateSystem
  onChange: (value: CoordinateSystem) => void
}) {
  return (
    <fieldset className="coordinate-system-picker">
      <legend>{label}</legend>
      <div>
        {COORDINATE_SYSTEMS.map((system) => (
          <button
            key={system.id}
            type="button"
            className={value === system.id ? 'is-active' : ''}
            aria-pressed={value === system.id}
            onClick={() => onChange(system.id)}
          >
            <span>{system.label}</span>
            <strong>{system.maps}</strong>
            <small>{system.description}</small>
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="coordinate-segmented">
      <span>{label}</span>
      <div>{options.map((option) => (
        <button key={option.value} type="button" className={value === option.value ? 'is-active' : ''} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}</div>
    </div>
  )
}

export default function CoordinateTool({ tool }: ToolViewProps) {
  const [mode, setMode] = useState<ViewMode>('single')
  const [sourceSystem, setSourceSystem] = useState<CoordinateSystem>('wgs84')
  const [targetSystem, setTargetSystem] = useState<CoordinateSystem>('gcj02')
  const [inputOrder, setInputOrder] = useState<CoordinateOrder>('lng-lat')
  const [outputOrder, setOutputOrder] = useState<CoordinateOrder>('lng-lat')
  const [precision, setPrecision] = useState(6)
  const [singleInput, setSingleInput] = useState(SINGLE_SAMPLE)
  const [batchInput, setBatchInput] = useState(BATCH_SAMPLE)
  const [batchRows, setBatchRows] = useState<BatchCoordinateResult[]>(() => convertBatch(BATCH_SAMPLE, 'wgs84', 'gcj02', 'lng-lat'))
  const [notice, setNotice] = useState<Notice>({ tone: 'success', message: '示例坐标已转换，结果仅在浏览器本地计算' })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const singleCalculation = useMemo(() => {
    try {
      const source = parseCoordinate(singleInput, inputOrder)
      return { source, results: convertToAll(source, sourceSystem), error: null }
    } catch (error) {
      return { source: null, results: null, error: error instanceof Error ? error.message : '坐标格式错误' }
    }
  }, [inputOrder, singleInput, sourceSystem])

  const activeNotice: Notice = mode === 'single' && singleCalculation.error
    ? { tone: 'error', message: singleCalculation.error }
    : notice

  function invalidateBatch(message: string) {
    setBatchRows([])
    setNotice({ tone: 'neutral', message })
  }

  function chooseSource(next: CoordinateSystem) {
    setSourceSystem(next)
    if (mode === 'batch') invalidateBatch(`来源已切换为 ${getCoordinateSystem(next).label}，请重新转换`)
    else setNotice({ tone: 'success', message: `已按 ${getCoordinateSystem(next).label} 重新识别并实时转换` })
  }

  function chooseInputOrder(next: CoordinateOrder) {
    setInputOrder(next)
    if (mode === 'batch') invalidateBatch('输入顺序已更新，请重新转换')
    else setNotice({ tone: 'neutral', message: '输入顺序已更新' })
  }

  function runBatch(source = batchInput) {
    try {
      const rows = convertBatch(source, sourceSystem, targetSystem, inputOrder)
      setBatchRows(rows)
      setNotice({ tone: 'success', message: `已将 ${rows.length} 个坐标转换为 ${getCoordinateSystem(targetSystem).label}` })
    } catch (error) {
      setBatchRows([])
      const inputError = error instanceof CoordinateInputError ? error : null
      const prefix = inputError?.line ? `第 ${inputError.line} 行：` : ''
      setNotice({ tone: 'error', message: `${prefix}${error instanceof Error ? error.message : '批量转换失败'}` })
    }
  }

  function swapBatchSystems() {
    setSourceSystem(targetSystem)
    setTargetSystem(sourceSystem)
    invalidateBatch('来源与目标已互换，请重新转换')
  }

  async function copyText(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text)
      setNotice({ tone: 'success', message })
    } catch {
      setNotice({ tone: 'error', message: '浏览器未允许访问剪贴板，请手动复制' })
    }
  }

  function loadExample() {
    if (mode === 'single') {
      setSingleInput(SINGLE_SAMPLE)
      setNotice({ tone: 'success', message: '已填入北京示例坐标并实时转换' })
    } else {
      setBatchInput(BATCH_SAMPLE)
      runBatch(BATCH_SAMPLE)
    }
  }

  async function loadBatchFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_COORDINATE_TEXT_BYTES) {
      setBatchRows([])
      setNotice({ tone: 'error', message: `${file.name} 超过 512 KB 的处理上限` })
      return
    }
    try {
      const content = await file.text()
      setBatchInput(content)
      runBatch(content)
    } catch {
      setBatchRows([])
      setNotice({ tone: 'error', message: `无法读取 ${file.name}，请确认文件未损坏` })
    }
  }

  function downloadBatch() {
    const content = serializeBatch(batchRows, outputOrder, precision)
    const url = URL.createObjectURL(new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${sourceSystem}-to-${targetSystem}.csv`
    link.click()
    URL.revokeObjectURL(url)
    setNotice({ tone: 'success', message: '批量结果已下载为 CSV' })
  }

  function clear() {
    if (mode === 'single') setSingleInput('')
    else {
      setBatchInput('')
      setBatchRows([])
    }
    setNotice({ tone: 'neutral', message: '内容已清空' })
  }

  const orderOptions: readonly { value: CoordinateOrder; label: string }[] = [
    { value: 'lng-lat', label: '经度, 纬度' },
    { value: 'lat-lng', label: '纬度, 经度' },
  ]

  return (
    <div className="coordinate-tool">
      <div className="coordinate-topbar">
        <div className="coordinate-mode-switch" aria-label="转换模式">
          <button type="button" className={mode === 'single' ? 'is-active' : ''} onClick={() => setMode('single')}>单个坐标</button>
          <button type="button" className={mode === 'batch' ? 'is-active' : ''} onClick={() => setMode('batch')}>批量转换</button>
        </div>
        <div className="coordinate-top-actions">
          <button type="button" onClick={loadExample}>填入示例</button>
          <button type="button" onClick={clear}>清空</button>
          <span>仅在浏览器本地处理</span>
        </div>
      </div>

      <div className={`coordinate-notice is-${activeNotice.tone}`} role={activeNotice.tone === 'error' ? 'alert' : 'status'}>
        <span>{activeNotice.tone === 'error' ? <Icon name="alert" /> : activeNotice.tone === 'success' ? <Icon name="check" /> : <Icon name="info" />}</span>
        <p>{activeNotice.message}</p>
      </div>

      <SystemCards label="坐标来自哪里" value={sourceSystem} onChange={chooseSource} />

      {mode === 'single' ? (
        <div className="coordinate-single-workspace">
          <section className="coordinate-input-card">
            <header><span>01</span><h2>输入原坐标</h2></header>
            <Segmented label="原坐标顺序" value={inputOrder} options={orderOptions} onChange={chooseInputOrder} />
            <label className="coordinate-main-input">
              <span>经纬度</span>
              <input aria-label="单个坐标" value={singleInput} onChange={(event) => { setSingleInput(event.target.value); setNotice({ tone: 'neutral', message: '正在实时检查坐标' }) }} placeholder="例如：116.397128, 39.916527" />
            </label>
            <div className="coordinate-input-guide">
              <div><b>经度</b><span>-180 ～ 180</span></div>
              <div><b>纬度</b><span>-90 ～ 90</span></div>
            </div>
            {singleCalculation.source && singleCalculation.results ? (
              <div className="coordinate-offset">
                <span>三种坐标数值的最大偏移约</span>
                <strong>{Math.round(Math.max(...Object.values(singleCalculation.results).map((result) => approximateOffsetMeters(singleCalculation.source!, result))))} 米</strong>
              </div>
            ) : null}
          </section>

          <section className="coordinate-results-card">
            <header><span>02</span><h2>各地图可用坐标</h2><b>一次输出三种结果</b></header>
            <Segmented label="结果坐标顺序" value={outputOrder} options={orderOptions} onChange={setOutputOrder} />
            <div className="coordinate-result-list">
              {COORDINATE_SYSTEMS.map((system) => {
                const result = singleCalculation.results?.[system.id]
                const value = result ? formatCoordinate(result, outputOrder, precision) : '等待有效坐标'
                return (
                  <article key={system.id} className={sourceSystem === system.id ? 'is-source' : ''}>
                    <div><span>{system.label}</span>{sourceSystem === system.id ? <b>原始</b> : null}</div>
                    <strong>{system.maps}</strong>
                    <code>{value}</code>
                    <button type="button" disabled={!result} onClick={() => result && void copyText(value, `已复制 ${system.label} 坐标`)}>复制</button>
                  </article>
                )
              })}
            </div>
            <div className="coordinate-precision">
              <span>结果精度</span>
              {[6, 8].map((value) => <button key={value} type="button" className={precision === value ? 'is-active' : ''} onClick={() => setPrecision(value)}>{value} 位小数</button>)}
            </div>
          </section>
        </div>
      ) : (
        <div className="coordinate-batch-shell">
          <div className="coordinate-batch-route">
            <SystemCards label="转换到" value={targetSystem} onChange={(value) => { setTargetSystem(value); invalidateBatch('目标坐标系已更新，请重新转换') }} />
            <button type="button" className="coordinate-swap" onClick={swapBatchSystems} aria-label="互换来源和目标"><Icon name="swap" /></button>
          </div>
          <div className="coordinate-batch-settings">
            <Segmented label="输入顺序" value={inputOrder} options={orderOptions} onChange={chooseInputOrder} />
            <Segmented label="输出顺序" value={outputOrder} options={orderOptions} onChange={setOutputOrder} />
          </div>
          <div className="coordinate-batch-workspace">
            <section className="coordinate-batch-panel">
              <header><div><span>01</span><h2>批量输入</h2></div><div><button type="button" onClick={() => fileInputRef.current?.click()}>打开 CSV / TXT</button><button type="button" className="is-primary" onClick={() => runBatch()}>开始转换</button></div></header>
              <textarea aria-label="批量坐标输入" value={batchInput} onChange={(event) => { setBatchInput(event.target.value); invalidateBatch('批量内容已更新，请点击开始转换') }} placeholder="每行一个坐标；可选名称,经度,纬度" />
              <footer><span>每行一组</span><span>支持“名称,坐标”</span><span>最多 1,000 组</span></footer>
              <input ref={fileInputRef} hidden type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(event) => void loadBatchFile(event)} />
            </section>
            <section className="coordinate-batch-panel">
              <header><div><span>02</span><h2>转换结果</h2></div><div><button type="button" disabled={!batchRows.length} onClick={() => void copyText(serializeBatch(batchRows, outputOrder, precision), '批量结果已复制')}>复制全部</button><button type="button" disabled={!batchRows.length} onClick={downloadBatch}>下载 CSV</button></div></header>
              {batchRows.length ? (
                <div className="coordinate-batch-table">
                  <div className="coordinate-batch-table-head"><span>#</span><span>名称</span><span>{getCoordinateSystem(targetSystem).label} 结果</span></div>
                  {batchRows.map((row) => <div key={`${row.line}-${row.label}`}><span>{row.line}</span><span>{row.label || '—'}</span><code>{formatCoordinate(row.target, outputOrder, precision)}</code></div>)}
                </div>
              ) : <div className="coordinate-empty"><span><Icon name="external" /></span><strong>等待批量转换</strong><p>检查来源、顺序和目标后开始转换</p></div>}
              <footer><span>{batchRows.length.toLocaleString()} 个坐标</span><span>{getCoordinateSystem(sourceSystem).label} <Icon name="arrowRight" />{getCoordinateSystem(targetSystem).label}</span></footer>
            </section>
          </div>
        </div>
      )}

      <p className="coordinate-warning"><strong>精度说明：</strong>浏览器使用业界常见近似公式，适合开发调试和一般业务数据处理，不适用于高精度测绘。Google 中国道路与卫星图层可能不同，请优先采用来源接口明确标注的坐标类型。</p>
      <span className="coordinate-tool-name">{tool.displayName}</span>
    </div>
  )
}
