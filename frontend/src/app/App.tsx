import { createElement, Suspense, useEffect, useRef } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { recordToolUsage } from '../api/toolCatalog'
import { useToolCatalog } from '../hooks/useToolCatalog'
import { preloadClientToolBySlug, resolveClientTool } from '../tools/registry'
import type { ToolDescriptor } from '../types/tool'
import Dashboard from './Dashboard'
import { compareCategoryCodes, formatCategory, toolHref } from './dashboardModel'

export function App() {
  const catalog = useToolCatalog()

  return (
    <div className="app-shell">
      <Sidebar tools={catalog.tools} loading={catalog.loading} />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard {...catalog} />} />
          <Route path="/tools/:slug" element={<ToolRoute tools={catalog.tools} loading={catalog.loading} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function Sidebar({ tools, loading }: { tools: ToolDescriptor[]; loading: boolean }) {
  const location = useLocation()
  const navigationRef = useRef<HTMLElement>(null)
  const grouped = tools.reduce((categories, tool) => {
    const categoryTools = categories.get(tool.categoryCode) ?? []
    categoryTools.push(tool)
    categories.set(tool.categoryCode, categoryTools)
    return categories
  }, new Map<string, ToolDescriptor[]>())

  useEffect(() => {
    const activeLink = navigationRef.current?.querySelector<HTMLElement>('[aria-current="page"]')
    if (activeLink && typeof activeLink.scrollIntoView === 'function') {
      activeLink.scrollIntoView({ block: 'nearest' })
    }
  }, [location.pathname, tools])

  return (
    <aside className="sidebar">
      <Link className="brand" to="/" aria-label="返回首页">
        <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
        <span>Tool Web</span>
      </Link>

      <header className="sidebar-workspace">
        <div>
          <span className="sidebar-workspace-mark" aria-hidden="true" />
          <h2>工作区</h2>
        </div>
        <span className="sidebar-workspace-count" aria-label={`${tools.length} 个可用工具`}>
          {loading ? '同步中' : `${tools.length} 项`}
        </span>
      </header>

      <nav ref={navigationRef} className="navigation" aria-label="工具导航">
        <NavLink className="nav-link nav-home" to="/" end>
          <span className="tool-glyph" aria-hidden="true">
            <svg className="nav-home-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m3 10 9-7 9 7v10H3z" /><path d="M9 20v-7h6v7" /></svg>
          </span>
          <span className="nav-label">控制台</span>
        </NavLink>

        {loading && <p className="nav-muted">正在读取工具目录…</p>}
        {[...grouped.entries()].sort(([left], [right]) => compareCategoryCodes(left, right)).map(([category, categoryTools]) => (
          <section className="nav-group" key={category} aria-labelledby={`nav-group-${category}`}>
            <h2 id={`nav-group-${category}`} data-count={categoryTools.length}>{formatCategory(category)}</h2>
            <div className="nav-group-tools">
              {categoryTools.map((tool) => (
                <NavLink className="nav-link" key={tool.slug} to={toolHref(tool)}>
                  <span className="tool-glyph" aria-hidden="true">{tool.displayName.slice(0, 1)}</span>
                  <span className="nav-label">{tool.displayName}</span>
                </NavLink>
              ))}
            </div>
          </section>
        ))}
      </nav>

      <div className="sidebar-footer">
        <span className="status-dot" />
        <span>服务框架已就绪</span>
      </div>
    </aside>
  )
}

function ToolRoute({ tools, loading }: { tools: ToolDescriptor[]; loading: boolean }) {
  const { slug } = useParams()
  const tool = tools.find((candidate) => candidate.slug === slug)
  const recordedUsageSlug = useRef<string | null>(null)
  const toolSlug = tool?.slug

  useEffect(() => {
    if (!slug) return
    void preloadClientToolBySlug(slug)?.catch(() => {
      // React.lazy retries through the resettable loader if this speculative fetch fails.
    })
  }, [slug])

  useEffect(() => {
    if (!toolSlug || recordedUsageSlug.current === toolSlug) return
    recordedUsageSlug.current = toolSlug
    void recordToolUsage(toolSlug)
  }, [toolSlug])

  if (loading) return <StatePanel title="正在加载" detail="正在确认工具配置…" />
  if (!tool) return <Navigate to="/" replace />

  const ClientTool = resolveClientTool(tool.frontendKey)

  return (
    <div className="tool-page">
      <header className="tool-header">
        <span className="tool-card-icon">{tool.displayName.slice(0, 1)}</span>
        <div><small>{tool.categoryCode} · {tool.executionMode}</small><h1>{tool.displayName}</h1><p>{tool.description}</p></div>
      </header>
      <section className="workbench">
        {ClientTool ? (
          <Suspense fallback={<StatePanel title="正在加载组件" detail="工具界面按需载入中…" />}>
            {createElement(ClientTool, { tool })}
          </Suspense>
        ) : (
          <StatePanel
            title="实现尚未部署"
            detail={`目录配置已存在，但前端组件 ${tool.frontendKey ?? '（无）'} 尚未注册。`}
          />
        )}
      </section>
    </div>
  )
}

function StatePanel({ title, detail, tone = 'neutral' }: { title: string; detail: string; tone?: 'neutral' | 'error' }) {
  return (
    <div className={`state-panel ${tone}`}>
      <span className="state-symbol">{tone === 'error' ? '!' : '·'}</span>
      <div><h3>{title}</h3><p>{detail}</p></div>
    </div>
  )
}
