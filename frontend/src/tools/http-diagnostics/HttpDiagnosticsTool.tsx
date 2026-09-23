import { Icon } from "../../components/Icon"
import { useEffect, useMemo, useRef, useState } from 'react'
import { executeServerTool } from '../../api/toolCatalog'
import type { ToolViewProps } from '../registry'
import {
  describeHeader,
  formatBytes,
  parseDiagnosticsResult,
  prepareDiagnosticUrl,
  statusTone,
  type DiagnosticMethod,
  type DiagnosticTab,
  type DiagnosticAuthType,
  type HttpDiagnosticsResult,
} from './httpDiagnosticsModel'
import './httpDiagnostics.css'

const TABS: { id: DiagnosticTab; label: string }[] = [
  { id: 'overview', label: '诊断总览' },
  { id: 'redirects', label: '重定向链' },
  { id: 'headers', label: '响应头' },
  { id: 'cache', label: '缓存与压缩' },
  { id: 'tls', label: 'TLS / 证书' },
  { id: 'timing', label: '连接耗时' },
]

export default function HttpDiagnosticsTool({ tool }: ToolViewProps) {
  const [url, setUrl] = useState('')
  const [method, setMethod] = useState<DiagnosticMethod>('GET')
  const [followRedirects, setFollowRedirects] = useState(true)
  const [timeoutMs, setTimeoutMs] = useState(12000)
  const [maxRedirects, setMaxRedirects] = useState(6)
  const [acceptLanguage, setAcceptLanguage] = useState('zh-CN,zh;q=0.9,en;q=0.7')
  const [userAgent, setUserAgent] = useState('')
  const [authType, setAuthType] = useState<DiagnosticAuthType>('NONE')
  const [authUsername, setAuthUsername] = useState('')
  const [authSecret, setAuthSecret] = useState('')
  const [apiKeyHeader, setApiKeyHeader] = useState('X-API-Key')
  const [showSecret, setShowSecret] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<HttpDiagnosticsResult | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<DiagnosticTab>('overview')
  const [headerQuery, setHeaderQuery] = useState('')
  const [notice, setNotice] = useState('')
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => controllerRef.current?.abort(), [])

  const visibleHeaders = useMemo(() => {
    if (!result) return []
    const query = headerQuery.trim().toLowerCase()
    return query ? result.headers.filter((header) => {
      const help = describeHeader(header.name)
      return `${header.name} ${header.value} ${help.category} ${help.description}`.toLowerCase().includes(query)
    }) : result.headers
  }, [headerQuery, result])

  async function inspect() {
    if (!url.trim()) {
      setError('请输入需要诊断的 HTTP 或 HTTPS 地址')
      return
    }
    const preparedUrl = prepareDiagnosticUrl(url)
    if (preparedUrl.embeddedCredentials) {
      setUrl(preparedUrl.url)
      setAdvanced(true)
      setError('已从 URL 中移除内嵌凭证，请在高级设置的凭证区域中安全填写')
      return
    }
    if (authType !== 'NONE' && !authSecret) {
      setError('请输入本次请求需要使用的认证凭证')
      return
    }
    if (authType === 'BASIC' && !authUsername.trim()) {
      setError('请输入 Basic Auth 用户名')
      return
    }
    if (authType === 'API_KEY' && !apiKeyHeader.trim()) {
      setError('请输入 API Key 请求头名称')
      return
    }
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    if (preparedUrl.fragmentRemoved) setUrl(preparedUrl.url)
    setBusy(true); setError(''); setNotice(preparedUrl.fragmentRemoved ? '已忽略 # 后的浏览器片段，并按实际 HTTP 地址发起诊断' : ''); setResult(null)
    try {
      const outputPromise = executeServerTool(tool.slug, {
        url: preparedUrl.url, method, followRedirects, timeoutMs, maxRedirects,
        acceptLanguage: acceptLanguage.trim() || null,
        userAgent: userAgent.trim() || null,
        authentication: authType === 'NONE' ? null : {
          type: authType,
          username: authType === 'BASIC' ? authUsername : null,
          secret: authSecret,
          headerName: authType === 'API_KEY' ? apiKeyHeader : null,
        },
      }, controller.signal)
      const output = await outputPromise
      if (controllerRef.current !== controller) return
      setResult(parseDiagnosticsResult(output))
      setTab('overview')
    } catch (caught) {
      if (controller.signal.aborted) return
      setError(caught instanceof Error ? caught.message : '诊断请求失败')
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
        setBusy(false)
      }
    }
  }

  function changeAuthentication(next: DiagnosticAuthType) {
    setAuthType(next)
    setAuthSecret('')
    setShowSecret(false)
    if (next !== 'BASIC') setAuthUsername('')
    if (next !== 'API_KEY') setApiKeyHeader('X-API-Key')
  }

  function cancel() {
    controllerRef.current?.abort()
    controllerRef.current = null
    setBusy(false)
    setNotice('本次诊断已取消')
  }

  async function copy(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value)
      setNotice(message)
    } catch {
      setError('复制失败，请检查浏览器剪贴板权限')
    }
  }

  return <div className="http-diagnostic" data-tool={tool.slug}>
    <section className="hd-composer" aria-label="诊断请求配置">
      <header className="hd-composer-head">
        <div><span>SERVER REQUEST</span><h2>配置诊断请求</h2></div>
        <p><i /> 服务端执行 · 凭证不记录 · 跨来源自动剥离</p>
      </header>
      <div className="hd-methods" aria-label="请求方法">
        {(['GET', 'HEAD'] as const).map((item) => <button type="button" key={item} className={method === item ? 'is-active' : ''} aria-pressed={method === item} onClick={() => setMethod(item)}>{item}</button>)}
      </div>
      <label className="hd-url">
        <span aria-hidden="true"><Icon name="external" /></span>
        <input aria-label="目标 URL" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="例如：https://www.example.com/resource" spellCheck={false} onKeyDown={(event) => { if (event.key === 'Enter') void inspect() }} />
      </label>
      {busy
        ? <button type="button" className="hd-run is-cancel" onClick={cancel}>取消诊断</button>
        : <button type="button" className="hd-run" onClick={() => void inspect()}>开始诊断 <span><Icon name="arrowRight" /></span></button>}
      <button type="button" className={`hd-advanced-trigger${advanced ? ' is-open' : ''}`} aria-expanded={advanced} aria-controls="http-diagnostics-advanced" onClick={() => setAdvanced((value) => !value)}>高级设置 <span className="hd-chevron" aria-hidden="true" /></button>
      <div id="http-diagnostics-advanced" className={`hd-advanced${advanced ? ' is-open' : ''}`} aria-hidden={!advanced} inert={!advanced}>
        <div className="hd-request-options">
          <div className="hd-advanced-title"><div><span>REQUEST</span><h3>请求策略</h3></div><p>控制超时、跳转与客户端标识</p></div>
          <div className="hd-option-grid">
            <label><span>总超时预算</span><select value={timeoutMs} onChange={(event) => setTimeoutMs(Number(event.target.value))}><option value={5000}>5 秒</option><option value={12000}>12 秒</option><option value={20000}>20 秒</option></select></label>
            <label><span>最大重定向</span><select value={maxRedirects} onChange={(event) => setMaxRedirects(Number(event.target.value))}><option value={3}>3 次</option><option value={6}>6 次</option><option value={10}>10 次</option></select></label>
            <button
              type="button"
              className={`hd-switch${followRedirects ? ' is-on' : ''}`}
              role="switch"
              aria-checked={followRedirects}
              onClick={() => setFollowRedirects((value) => !value)}
            >
              <span aria-hidden="true" />
              <b>自动跟随重定向</b>
            </button>
            <label><span>Accept-Language</span><input value={acceptLanguage} onChange={(event) => setAcceptLanguage(event.target.value)} /></label>
            <label className="hd-wide-field"><span>User-Agent（可选）</span><input value={userAgent} onChange={(event) => setUserAgent(event.target.value)} placeholder="留空使用 ToolWeb 诊断标识" /></label>
          </div>
        </div>
        <div className="hd-auth-options">
          <div className="hd-advanced-title"><div><span>AUTH</span><h3>包含用户凭证</h3></div><p>仅用于本次服务端请求</p></div>
          <div className="hd-auth-types" role="group" aria-label="认证方式">
            {([['NONE', '无认证'], ['BASIC', 'Basic'], ['BEARER', 'Bearer'], ['API_KEY', 'API Key']] as const).map(([value, label]) => <button type="button" key={value} className={authType === value ? 'is-active' : ''} aria-pressed={authType === value} onClick={() => changeAuthentication(value)}>{label}</button>)}
          </div>
          {authType === 'NONE'
            ? <div className="hd-auth-empty"><span><Icon name="check" /></span><p>本次请求不会携带 Authorization 或 API Key。</p></div>
            : <div className="hd-auth-fields">
              {authType === 'BASIC' && <label><span>用户名</span><input aria-label="认证用户名" value={authUsername} onChange={(event) => setAuthUsername(event.target.value)} autoComplete="off" /></label>}
              {authType === 'API_KEY' && <label><span>请求头名称</span><input aria-label="API Key 请求头名称" value={apiKeyHeader} onChange={(event) => setApiKeyHeader(event.target.value)} placeholder="X-API-Key" autoComplete="off" /></label>}
              <label className="hd-secret-field"><span>{authType === 'BASIC' ? '密码' : authType === 'BEARER' ? '令牌' : 'API Key'}</span><div><input aria-label="认证凭证" type={showSecret ? 'text' : 'password'} value={authSecret} onChange={(event) => setAuthSecret(event.target.value)} autoComplete="new-password" spellCheck={false} /><button type="button" aria-label={showSecret ? '隐藏凭证' : '显示凭证'} onClick={() => setShowSecret((value) => !value)}>{showSecret ? '隐藏' : '显示'}</button></div></label>
            </div>}
          <div className="hd-auth-note"><span><Icon name="info" /></span><p>凭证不会出现在诊断结果或日志中；一旦重定向改变协议、域名或端口，系统会自动停止转发。</p></div>
        </div>
      </div>
    </section>

    {(error || notice) && <div className={`hd-notice${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}><span>{error ? <Icon name="alert" /> : <Icon name="check" />}</span>{error || notice}</div>}

    <section className={`hd-results${busy ? ' is-loading' : ''}`} aria-busy={busy}>
      {busy && <LoadingState />}
      {!busy && !result && <EmptyState />}
      {!busy && result && <>
        <header className="hd-result-head">
          <div><span className={`hd-status is-${statusTone(result.status)}`}>{result.status}</span><div><small>{result.protocol} · {result.method}</small><h2>{result.reasonPhrase || 'HTTP Response'}</h2></div></div>
          <button type="button" onClick={() => void copy(result.finalUrl, '最终 URL 已复制')}>复制最终 URL</button>
        </header>
        <div className="hd-final-url"><span>最终地址</span><code>{result.finalUrl}</code></div>
        <div className="hd-metrics">
          <Metric label="总耗时" value={`${result.timing.totalMs} ms`} detail="含重定向与 DNS" />
          <Metric label="重定向" value={`${result.redirects.length} 跳`} detail={result.redirects.length ? '已逐跳安全校验' : '直接到达目标'} />
          <Metric label="TLS 握手" value={result.tls.used ? `${result.tls.totalHandshakeMs} ms` : '未使用'} detail={result.tls.used ? `${result.tls.handshakeCount} 次 · ${result.tls.handshakes.at(-1)?.protocol}` : '明文 HTTP'} />
          <Metric label="内容压缩" value={result.compression.compressed ? result.compression.contentEncoding : '未压缩'} detail={formatBytes(result.compression.contentLength)} />
          <Metric label="缓存策略" value={result.cache.freshnessSeconds === null ? '未声明时效' : `${result.cache.freshnessSeconds}s`} detail={result.cache.sharedCacheable ? '共享缓存可用' : '共享缓存受限'} />
        </div>
        <nav className="hd-tabs" aria-label="诊断结果">
          {TABS.map((item) => <button type="button" key={item.id} className={tab === item.id ? 'is-active' : ''} aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>{item.label}{item.id === 'headers' && <i>{result.headers.length}</i>}{item.id === 'redirects' && <i>{result.redirects.length}</i>}{item.id === 'tls' && <i>{result.tls.handshakeCount}</i>}</button>)}
        </nav>
        <div className="hd-tab-panel">
          {tab === 'overview' && <Overview result={result} />}
          {tab === 'redirects' && <Redirects result={result} />}
          {tab === 'headers' && <Headers result={result} rows={visibleHeaders} query={headerQuery} onQuery={setHeaderQuery} onCopy={copy} />}
          {tab === 'cache' && <CacheAndCompression result={result} />}
          {tab === 'tls' && <TlsDetails result={result} />}
          {tab === 'timing' && <Timing result={result} />}
        </div>
        <footer className="hd-result-foot"><span>请求 ID · <code>{result.requestId}</code></span><span>{new Date(result.inspectedAt).toLocaleString('zh-CN')}</span></footer>
      </>}
    </section>
  </div>
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>
}

function Overview({ result }: { result: HttpDiagnosticsResult }) {
  return <div className="hd-overview">
    <section className="hd-analysis-summary" aria-label="专业分析摘要">
      <article className="hd-score-card">
        <div><span>SECURITY HEADERS</span><strong>{result.security.grade}</strong><b>{result.security.score}<small>/100</small></b></div>
        <p>{result.security.summary}</p>
      </article>
      <AnalysisCard eyebrow="CORS" title={result.cors.configured ? '已声明跨域策略' : '未声明跨域策略'} detail={result.cors.summary} meta={`允许来源 · ${result.cors.allowOrigin}`} />
      <AnalysisCard eyebrow="RESPONSE" title={result.response.contentType} detail={result.response.summary} meta={`Server · ${result.response.server}`} />
      <AnalysisCard eyebrow="CREDENTIALS" title={result.authentication.configured ? `${result.authentication.type} 已配置` : '未包含用户凭证'} detail={result.authentication.summary} meta={result.authentication.strippedOnRedirect ? '跨来源跳转 · 已剥离' : '转发边界 · 原始来源'} />
    </section>
    <section className="hd-control-matrix" aria-label="安全响应头检查">
      <header><div><span>CONTROL MATRIX</span><h3>安全响应头检查</h3></div><p>{result.security.cookieCount ? `${result.security.cookieCount} 个 Cookie · ${result.security.weakCookieCount} 个需复核` : '未设置 Cookie'}</p></header>
      <div>{result.security.controls.map((control) => <article className={`is-${control.status}`} key={control.name}><span>{control.status === 'pass' ? <Icon name="check" /> : control.status === 'warning' ? <Icon name="alert" /> : <Icon name="info" />}</span><div><h4>{control.name}</h4><p>{control.detail}</p></div></article>)}</div>
    </section>
    <section className="hd-findings" aria-label="诊断结论">{result.findings.map((finding, index) => <article className={`is-${finding.level}`} key={`${finding.title}-${index}`}><span>{finding.level === 'success' ? <Icon name="check" /> : finding.level === 'warning' ? <Icon name="alert" /> : finding.level === 'error' ? <Icon name="close" /> : <Icon name="info" />}</span><div><h3>{finding.title}</h3><p>{finding.detail}</p></div></article>)}</section>
  </div>
}

function AnalysisCard({ eyebrow, title, detail, meta }: { eyebrow: string; title: string; detail: string; meta: string }) {
  return <article className="hd-analysis-card"><span>{eyebrow}</span><h3>{title}</h3><p>{detail}</p><small>{meta}</small></article>
}

function Redirects({ result }: { result: HttpDiagnosticsResult }) {
  if (!result.redirects.length) return <PanelEmpty title="没有发生重定向" detail="请求直接到达最终地址。" />
  return <ol className="hd-redirects">{result.redirects.map((hop) => <li key={hop.sequence}><span>{String(hop.sequence).padStart(2, '0')}</span><div><b>{hop.status}</b><code>{hop.url}</code><small>Location → {hop.resolvedUrl}</small></div><em>{hop.durationMs} ms</em></li>)}</ol>
}

function Headers({ rows, query, onQuery, onCopy }: { result: HttpDiagnosticsResult; rows: HttpDiagnosticsResult['headers']; query: string; onQuery: (value: string) => void; onCopy: (value: string, message: string) => Promise<void> }) {
  return <div className="hd-headers"><label className="hd-header-search"><span><Icon name="search" /></span><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="搜索响应头名称、内容或作用" /><b>{rows.length} 项</b></label><div>{rows.map((header, index) => {
    const help = describeHeader(header.name)
    return <article key={`${header.name}-${index}`}>
      <div className="hd-header-name"><strong>{header.name}</strong><span>{help.category}</span></div>
      <div className="hd-header-content"><code>{header.value}</code><p>{help.description}</p></div>
      <button type="button" aria-label={`复制 ${header.name}`} onClick={() => void onCopy(`${header.name}: ${header.value}`, `${header.name} 已复制`)}>复制</button>
    </article>
  })}</div></div>
}

function CacheAndCompression({ result }: { result: HttpDiagnosticsResult }) {
  return <div className="hd-analysis-grid"><article><span>COMPRESSION</span><h3>{result.compression.compressed ? '已启用响应压缩' : '未检测到响应压缩'}</h3><p>{result.compression.summary}</p><dl><dt>Content-Encoding</dt><dd>{result.compression.contentEncoding}</dd><dt>Content-Type</dt><dd>{result.compression.contentType}</dd><dt>Vary: Accept-Encoding</dt><dd>{result.compression.variesByAcceptEncoding ? '是' : '否'}</dd></dl></article><article><span>CACHE POLICY</span><h3>{result.cache.browserCacheable ? '浏览器可以存储响应' : '浏览器缓存受限'}</h3><p>{result.cache.summary}</p><dl><dt>Cache-Control</dt><dd>{result.cache.cacheControl}</dd><dt>共享缓存</dt><dd>{result.cache.sharedCacheable ? '允许' : '不允许 / 未确认'}</dd><dt>验证器</dt><dd>{result.cache.validator}</dd></dl></article></div>
}

function TlsDetails({ result }: { result: HttpDiagnosticsResult }) {
  if (!result.tls.used) return <PanelEmpty title="本次请求未使用 TLS" detail="明文 HTTP 不包含证书与 HTTPS 握手过程；使用 HTTPS 地址后可查看签发机构、协商协议和握手耗时。" />
  return <div className="hd-tls">
    <header className="hd-tls-summary">
      <div><span>TLS SESSION</span><h3>HTTPS 握手与证书链</h3><p>{result.tls.summary}</p></div>
      <div><strong>{result.tls.totalHandshakeMs}<small> ms</small></strong><span>{result.tls.handshakeCount} 次握手</span></div>
    </header>
    <div className="hd-tls-list">{result.tls.handshakes.map((handshake) => <article key={`${handshake.sequence}-${handshake.url}`}>
      <header><span>握手 {String(handshake.sequence).padStart(2, '0')}</span><code>{handshake.host}</code><strong>{handshake.handshakeMs} ms</strong></header>
      <section className="hd-certificate-identity">
        <div><span>签发机构</span><strong>{handshake.issuerOrganization}</strong><small>{handshake.issuerDistinguishedName}</small></div>
        <div><span>证书主体</span><strong>{handshake.subjectCommonName}</strong><small>{handshake.subjectDistinguishedName}</small></div>
      </section>
      <dl>
        <div><dt>协商协议</dt><dd>{handshake.protocol}</dd></div>
        <div><dt>密码套件</dt><dd>{handshake.cipherSuite}</dd></div>
        <div><dt>生效时间</dt><dd>{formatCertificateDate(handshake.validFrom)}</dd></div>
        <div className={handshake.daysRemaining < 30 ? 'is-warning' : ''}><dt>到期时间</dt><dd>{formatCertificateDate(handshake.validUntil)} · 剩余 {handshake.daysRemaining} 天</dd></div>
        <div><dt>签名算法</dt><dd>{handshake.signatureAlgorithm}</dd></div>
        <div><dt>证书链</dt><dd>{handshake.certificateChainLength} 张证书</dd></div>
        <div className="hd-tls-wide"><dt>序列号</dt><dd>{handshake.serialNumber}</dd></div>
        <div className="hd-tls-wide"><dt>请求地址</dt><dd>{handshake.url}</dd></div>
      </dl>
    </article>)}</div>
    <p className="hd-tls-note">证书信息来自本次诊断实际使用并完成主机名与信任链校验的连接；发生跨站重定向时会逐跳记录。</p>
  </div>
}

function Timing({ result }: { result: HttpDiagnosticsResult }) {
  const totalMs = Math.max(result.timing.totalMs, 0)
  const dnsMs = Math.min(Math.max(result.timing.dnsMs, 0), totalMs)
  const requestMs = Math.min(Math.max(result.timing.connectionAndHeadersMs, 0), Math.max(totalMs - dnsMs, 0))
  const tlsMs = result.tls.used ? Math.min(Math.max(result.tls.totalHandshakeMs, 0), requestMs) : 0
  const requestRemainderMs = Math.max(requestMs - tlsMs, 0)
  const analysisMs = Math.max(totalMs - dnsMs - requestMs, 0)
  const scale = Math.max(totalMs, 1)
  const phases = [
    { key: 'dns', label: 'DNS 解析', value: dnsMs, detail: '解析并校验目标地址' },
    { key: 'request', label: '连接与响应头', value: requestMs, detail: result.tls.used ? `其中 TLS 握手 ${tlsMs} ms` : 'TCP 建连、服务端处理与首个响应头' },
    { key: 'analysis', label: '结果分析', value: analysisMs, detail: '整理响应并生成诊断' },
  ]

  return <div className="hd-timing">
    <aside className="hd-timing-total">
      <span>END-TO-END</span>
      <strong>{totalMs}<small> ms</small></strong>
      <h3>完整流程耗时</h3>
      <p>{result.timing.note}</p>
      <div><span>主阶段</span><b>可直接相加</b></div>
    </aside>
    <section className="hd-timing-flow" aria-label={`完整流程 ${totalMs} 毫秒`}>
      <header><div><span>TIME BREAKDOWN</span><h3>请求阶段分解</h3></div><em>互斥阶段 · 不重复计时</em></header>
      <div className="hd-timing-track" aria-hidden="true">
        {phases.filter((phase) => phase.value > 0).map((phase) => <i key={phase.key} className={`is-${phase.key}`} style={{ width: `${phase.value / scale * 100}%` }} />)}
      </div>
      <div className="hd-timing-phases">
        {phases.map((phase, index) => <article key={phase.key} className={`is-${phase.key}`} aria-label={`${phase.label} ${phase.value} 毫秒`}>
          <header><span>{String(index + 1).padStart(2, '0')}</span><div><h4>{phase.label}</h4><p>{phase.detail}</p></div><strong>{phase.value}<small> ms</small></strong></header>
          {phase.key === 'request' && result.tls.used && <div className="hd-timing-request-detail" aria-label="连接与响应头子阶段">
            <div className="is-tls" aria-label={`TLS 握手 ${tlsMs} 毫秒`}><span>TLS 握手</span><i><b style={{ width: `${requestMs === 0 ? 0 : tlsMs / requestMs * 100}%` }} /></i><strong>{tlsMs} ms</strong></div>
            <div aria-label={`其余连接与等待 ${requestRemainderMs} 毫秒`}><span>其余连接与等待</span><i><b style={{ width: `${requestMs === 0 ? 0 : requestRemainderMs / requestMs * 100}%` }} /></i><strong>{requestRemainderMs} ms</strong></div>
          </div>}
        </article>)}
      </div>
    </section>
    <p className="hd-timing-note"><span aria-hidden="true"><Icon name="info" /></span><strong>读法：</strong>DNS、连接与响应头、结果分析相加等于完整流程；TLS 是连接阶段内部的子项。毫秒取整时，边界值可能存在约 1 ms 差异。所有耗时均在服务端所在网络测得，可能与浏览器本地 DevTools 不同。</p>
  </div>
}

function formatCertificateDate(value: string | null) {
  if (!value) return '未获取'
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}

function EmptyState() {
  return <div className="hd-empty"><div className="hd-empty-radar"><i /><i /><span><Icon name="external" /></span></div><h2>等待一次真实的响应</h2><p>输入公开 URL 后，服务端会安全发起请求并在这里呈现完整诊断。</p><div><span>状态码</span><span>重定向</span><span>缓存</span><span>压缩</span><span>耗时</span></div></div>
}

function LoadingState() {
  return <div className="hd-empty is-loading"><div className="hd-loader"><i /><span>HTTP</span></div><h2>正在建立安全连接</h2><p>解析 DNS、验证目标地址并等待响应头…</p><div className="hd-loading-steps"><span>校验目标</span><span>请求上游</span><span>生成诊断</span></div></div>
}

function PanelEmpty({ title, detail }: { title: string; detail: string }) {
  return <div className="hd-panel-empty"><span><Icon name="check" /></span><h3>{title}</h3><p>{detail}</p></div>
}
