import { Icon } from "../../components/Icon"
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { ToolViewProps } from '../registry'
import {
  DNS_RECORD_TYPES,
  comparisonLabel,
  formatTtl,
  resolverStatusLabel,
  type DnsDiagnosticsResult,
  type DnsRecordType,
} from './dnsDiagnosticsModel'
import { queryDnsInBrowser } from './dnsBrowserResolver'
import './dnsDiagnostics.css'

type ResultTab = 'overview' | 'records' | 'chain'

const EXAMPLES = ['example.com', 'cloudflare.com', 'aliyun.com']

export default function DnsDiagnosticsTool({ tool }: ToolViewProps) {
  const [domain, setDomain] = useState('')
  const [selectedTypes, setSelectedTypes] = useState<Set<DnsRecordType>>(() => new Set(DNS_RECORD_TYPES))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [result, setResult] = useState<DnsDiagnosticsResult | null>(null)
  const [tab, setTab] = useState<ResultTab>('overview')
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => controllerRef.current?.abort(), [])

  const selectedList = useMemo(
    () => DNS_RECORD_TYPES.filter((recordType) => selectedTypes.has(recordType)),
    [selectedTypes],
  )

  function toggleType(recordType: DnsRecordType) {
    setSelectedTypes((current) => {
      const next = new Set(current)
      if (next.has(recordType)) next.delete(recordType)
      else next.add(recordType)
      return next
    })
  }

  async function inspect() {
    if (!domain.trim()) {
      setError('请输入需要查询的域名')
      return
    }
    if (!selectedList.length) {
      setError('请至少选择一种 DNS 记录类型')
      return
    }
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setBusy(true)
    setError('')
    setNotice('')
    setResult(null)
    try {
      const output = await queryDnsInBrowser(domain, selectedList, controller.signal)
      if (controllerRef.current !== controller) return
      setResult(output)
      setDomain(output.requestedDomain)
      setTab('overview')
    } catch (caught) {
      if (controller.signal.aborted) return
      setError(caught instanceof Error ? caught.message : 'DNS 查询失败')
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
        setBusy(false)
      }
    }
  }

  function cancel() {
    controllerRef.current?.abort()
    controllerRef.current = null
    setBusy(false)
    setNotice('本次 DNS 查询已取消')
  }

  async function copy(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value)
      setNotice(message)
    } catch {
      setError('复制失败，请检查浏览器剪贴板权限')
    }
  }

  return <div className="dns-diagnostic" data-tool={tool.slug}>
    <section className="dns-composer" aria-label="DNS 查询配置">
      <header>
        <div><span>DNS LOOKUP · BROWSER LOCAL</span><h2>从多个公共 DNS 看同一个域名</h2></div>
        <p><i /> 浏览器直接查询 · 数据不经过本站服务器</p>
      </header>
      <div className="dns-input-row">
        <label>
          <span aria-hidden="true">◎</span>
          <input
            aria-label="查询域名"
            value={domain}
            disabled={busy}
            onChange={(event) => setDomain(event.target.value)}
            onKeyDown={(event) => { if (!busy && event.key === 'Enter') void inspect() }}
            placeholder="输入域名，例如 example.com"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {busy
          ? <button type="button" className="dns-run is-cancel" onClick={cancel}>取消查询</button>
          : <button type="button" className="dns-run" onClick={() => void inspect()}>开始查询 <span><Icon name="arrowRight" /></span></button>}
      </div>
      <div className="dns-record-selector">
        <div className="dns-selector-head">
          <div><strong>记录类型</strong><span>{selectedList.length} / {DNS_RECORD_TYPES.length} 已选择</span></div>
          <button type="button" disabled={busy} onClick={() => setSelectedTypes(new Set(DNS_RECORD_TYPES))}>选择全部</button>
        </div>
        <div role="group" aria-label="DNS 记录类型">
          {DNS_RECORD_TYPES.map((recordType) => <button
            type="button"
            key={recordType}
            className={selectedTypes.has(recordType) ? 'is-selected' : ''}
            aria-pressed={selectedTypes.has(recordType)}
            disabled={busy}
            onClick={() => toggleType(recordType)}
          ><span>{recordType}</span><i aria-hidden="true"><Icon name="check" /></i></button>)}
        </div>
      </div>
      <footer>
        <span>快速示例</span>
        {EXAMPLES.map((example) => <button type="button" disabled={busy} key={example} onClick={() => setDomain(example)}>{example}</button>)}
        <p>请求使用当前设备的网络与系统代理；结果来自公共递归解析器，不代表指定城市的精确探针。</p>
      </footer>
    </section>

    {(error || notice) && <div className={`dns-notice${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>
      <span>{error ? <Icon name="alert" /> : <Icon name="check" />}</span><p>{error || notice}</p>
    </div>}

    <section className={`dns-result${busy ? ' is-loading' : ''}`} aria-busy={busy}>
      {busy && <DnsLoading recordTypes={selectedList} />}
      {!busy && !result && <DnsEmpty />}
      {!busy && result && <>
        <header className="dns-result-head">
          <div className="dns-domain-identity"><span>RESOLVED DOMAIN</span><h2>{result.requestedDomain}</h2>{result.asciiDomain !== result.requestedDomain.toLowerCase().replace(/\.$/, '') && <code>{result.asciiDomain}</code>}</div>
          <div className="dns-summary-metrics">
            <Metric label="解析器" value={`${result.resolvers.filter((item) => item.status !== 'ERROR').length} / ${result.resolvers.length}`} detail="返回可用结果" />
            <Metric label="一致记录" value={`${result.comparisons.filter((item) => item.state === 'CONSISTENT').length}`} detail={`共 ${result.comparisons.length} 类`} />
            <Metric label="完整耗时" value={`${result.totalDurationMs} ms`} detail="浏览器本地并行" />
          </div>
          <button type="button" onClick={() => void copy(result.asciiDomain, '域名已复制')}>复制域名</button>
        </header>
        <nav className="dns-tabs" aria-label="DNS 诊断结果">
          <button type="button" className={tab === 'overview' ? 'is-active' : ''} aria-pressed={tab === 'overview'} onClick={() => setTab('overview')}>诊断总览</button>
          <button type="button" className={tab === 'records' ? 'is-active' : ''} aria-pressed={tab === 'records'} onClick={() => setTab('records')}>记录对比 <i>{result.comparisons.length}</i></button>
          <button type="button" className={tab === 'chain' ? 'is-active' : ''} aria-pressed={tab === 'chain'} onClick={() => setTab('chain')}>解析链路 <i>{result.resolvers.reduce((sum, item) => sum + item.cnameChain.length, 0)}</i></button>
        </nav>
        <div className="dns-tab-panel">
          {tab === 'overview' && <DnsOverview result={result} />}
          {tab === 'records' && <DnsRecords result={result} onCopy={copy} />}
          {tab === 'chain' && <DnsChains result={result} />}
        </div>
        <footer className="dns-result-foot"><span>本地查询 ID · <code>{result.requestId}</code></span><span>{new Date(result.inspectedAt).toLocaleString('zh-CN')}</span></footer>
      </>}
    </section>
  </div>
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>
}

function DnsOverview({ result }: { result: DnsDiagnosticsResult }) {
  return <div className="dns-overview">
    <section className="dns-findings" aria-label="诊断结论">
      <header><span>ANALYSIS</span><h3>专业分析</h3></header>
      <div>{result.findings.map((finding, index) => <article className={`is-${finding.level}`} key={`${finding.title}-${index}`}><span>{finding.level === 'success' ? <Icon name="check" /> : finding.level === 'warning' ? <Icon name="alert" /> : finding.level === 'error' ? <Icon name="close" /> : <Icon name="info" />}</span><div><h4>{finding.title}</h4><p>{finding.detail}</p></div></article>)}</div>
    </section>
    <section className="dns-resolver-grid" aria-label="解析器状态">
      {result.resolvers.map((resolver, index) => <article className={`is-${resolver.status.toLowerCase()}`} style={{ '--resolver-index': index } as CSSProperties} key={resolver.id}>
        <header><div><span>{String(index + 1).padStart(2, '0')}</span><h3>{resolver.name}</h3></div><b>{resolverStatusLabel(resolver.status)}</b></header>
        <p>{resolver.vantagePoint}</p>
        <div className="dns-resolver-progress"><i style={{ width: `${resolver.queryCount ? resolver.successfulQueries / resolver.queryCount * 100 : 0}%` }} /></div>
        <footer><span>{resolver.successfulQueries} / {resolver.queryCount} 项</span><strong>{resolver.durationMs} ms</strong></footer>
      </article>)}
    </section>
  </div>
}

function DnsRecords({ result, onCopy }: { result: DnsDiagnosticsResult; onCopy: (value: string, message: string) => Promise<void> }) {
  return <div className="dns-comparison-list">{result.comparisons.map((comparison, index) => <article className={`dns-comparison is-${comparison.state.toLowerCase()}`} style={{ '--record-index': index } as CSSProperties} key={comparison.recordType}>
    <header>
      <div><strong>{comparison.recordType}</strong><span>{comparisonLabel(comparison.state)}</span></div>
      <p>{comparison.summary}</p>
      <dl><div><dt>响应</dt><dd>{comparison.respondingResolvers} / {comparison.resolverCount}</dd></div><div><dt>TTL 范围</dt><dd>{comparison.minTtl === null ? '—' : `${formatTtl(comparison.minTtl)} – ${formatTtl(comparison.maxTtl)}`}</dd></div></dl>
    </header>
    <div className="dns-variant-table">
      {comparison.variants.map((variant) => {
        const query = result.resolvers.find((resolver) => resolver.id === variant.resolverId)?.queries.find((item) => item.recordType === comparison.recordType)
        return <section key={variant.resolverId}>
        <div><h4>{variant.resolverName}</h4><span className={`is-${variant.status.toLowerCase()}`}>{variant.status === 'ANSWER' ? '有记录' : variant.status === 'NO_DATA' ? '无记录' : variant.status === 'DNS_ERROR' ? 'DNS 错误' : '查询失败'}</span></div>
        <div className="dns-query-flags"><span>{query?.responseCodeName ?? 'UNAVAILABLE'}</span>{query?.authenticatedData && <b>AD · DNSSEC</b>}{query?.truncated && <b>TC · 已截断</b>}<i>{query?.durationMs ?? 0} ms</i></div>
        <div className="dns-values">{variant.values.length ? variant.values.map((value) => <div key={value}><code>{value}</code><button type="button" aria-label={`复制 ${value}`} onClick={() => void onCopy(value, `${comparison.recordType} 记录已复制`)}>复制</button></div>) : <p>{query?.error || '没有可比较的记录值'}</p>}</div>
        <small>TTL {variant.minTtl === null ? '—' : variant.minTtl === variant.maxTtl ? formatTtl(variant.minTtl) : `${formatTtl(variant.minTtl)} – ${formatTtl(variant.maxTtl)}`}</small>
      </section>})}
    </div>
  </article>)}</div>
}

function DnsChains({ result }: { result: DnsDiagnosticsResult }) {
  const hasChains = result.resolvers.some((resolver) => resolver.cnameChain.length)
  if (!hasChains) return <div className="dns-panel-empty"><span>↳</span><h3>没有发现 CNAME 跳转</h3><p>当前答案直接指向最终记录，或所选类型未返回别名链。</p></div>
  return <div className="dns-chain-grid">{result.resolvers.map((resolver) => <article key={resolver.id}>
    <header><div><span>RESOLVER</span><h3>{resolver.name}</h3></div><b>{resolver.cnameChain.length} 跳</b></header>
    {resolver.cnameChain.length ? <ol>{resolver.cnameChain.map((link, index) => <li key={`${link.from}-${link.to}`}><span>{index + 1}</span><div><code>{link.from}</code><i><Icon name="arrowDown" /></i><code>{link.to}</code></div><small>TTL {formatTtl(link.ttl)}</small></li>)}</ol> : <p>此解析器未返回 CNAME 链。</p>}
  </article>)}</div>
}

function DnsLoading({ recordTypes }: { recordTypes: DnsRecordType[] }) {
  return <div className="dns-loading"><div className="dns-radar"><i /><i /><span>DNS</span></div><div><span>LOCAL QUERY IN PROGRESS</span><h3>浏览器正在并行询问公共解析器</h3><p>查询 {recordTypes.join('、')}，并在本地整理 TTL、答案差异与 CNAME 链路。</p><div className="dns-loading-lines"><i /><i /><i /></div></div></div>
}

function DnsEmpty() {
  return <div className="dns-empty"><div><span>◎</span><i /><i /><i /></div><h3>等待一次 DNS 查询</h3><p>输入域名并选择记录类型，即可比较多个公共 DNS 的返回结果。</p><ul><li>记录值与 TTL</li><li>跨解析器差异</li><li>CNAME 解析链路</li></ul></div>
}
