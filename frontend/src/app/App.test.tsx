// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolDescriptor } from '../types/tool'
import { App } from './App'

const catalog = vi.hoisted(() => ({
  current: { tools: [] as ToolDescriptor[], loading: false, error: null as string | null },
}))
const registry = vi.hoisted(() => ({
  preloadClientToolBySlug: vi.fn(() => undefined),
}))
const api = vi.hoisted(() => ({
  recordToolUsage: vi.fn(() => Promise.resolve()),
}))

vi.mock('../hooks/useToolCatalog', () => ({
  useToolCatalog: () => catalog.current,
}))
vi.mock('../tools/registry', () => ({
  preloadClientToolBySlug: registry.preloadClientToolBySlug,
  resolveClientTool: vi.fn(() => undefined),
}))
vi.mock('../api/toolCatalog', () => ({
  recordToolUsage: api.recordToolUsage,
}))

const tools: ToolDescriptor[] = [
  { slug: 'world-time', displayName: '世界时间', description: '全球城市时间', categoryCode: 'other', iconKey: 'clock', routePath: '/tools/world-time', executionMode: 'CLIENT', frontendKey: 'world-time' },
  { slug: 'json-formatter', displayName: 'JSON 格式化', description: '格式化、校验与树形查看 JSON', categoryCode: 'developer', iconKey: 'json', routePath: '/tools/json-formatter', executionMode: 'CLIENT', frontendKey: 'json-formatter' },
  { slug: 'hash', displayName: '哈希计算', description: '计算文本或文件摘要', categoryCode: 'developer', iconKey: 'hash', routePath: '/tools/hash', executionMode: 'CLIENT', frontendKey: 'hash' },
  { slug: 'coordinate', displayName: '坐标转换', description: '转换不同地图坐标系', categoryCode: 'network', iconKey: 'coordinate', routePath: '/tools/coordinate', executionMode: 'CLIENT', frontendKey: 'coordinate' },
  { slug: 'image-converter', displayName: '图片格式转换', description: '转换 JPG、PNG 与 WebP', categoryCode: 'image', iconKey: 'image', routePath: '/tools/image-converter', executionMode: 'CLIENT', frontendKey: 'graphics.image.convert.v1' },
]

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
    catalog.current = { tools: [], loading: false, error: null }
    registry.preloadClientToolBySlug.mockClear()
    api.recordToolUsage.mockClear()
  })

  afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('does not record another tool visit when changing appearance repeatedly', () => {
    catalog.current = { tools, loading: false, error: null }
    render(<MemoryRouter initialEntries={['/tools/hash']}><App /></MemoryRouter>)
    for (let i = 0; i < 5; i++) {
      fireEvent.click(screen.getByRole('button', { name: '经典版' }))
      fireEvent.click(screen.getByRole('button', { name: '现代版' }))
    }
    expect(api.recordToolUsage).toHaveBeenCalledTimes(1)
    expect(api.recordToolUsage).toHaveBeenCalledWith('hash')
    expect(screen.getByRole('link', { name: '哈希计算' }).getAttribute('aria-current')).toBe('page')
  })

  it('contains mobile drawer focus and restores focus on Escape', () => {
    catalog.current = { tools, loading: false, error: null }
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('850'), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{ width: 10, height: 10 }] as unknown as DOMRectList)
    render(<MemoryRouter initialEntries={['/tools/hash']}><App /></MemoryRouter>)
    const trigger = screen.getByRole('button', { name: '工具导航' })
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: '工具导航' })
    const close = within(dialog).getByRole('button', { name: '关闭工具导航' })
    expect(document.activeElement).toBe(close)
    const last = within(dialog).getAllByRole('link').at(-1)!
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('renders the empty catalog foundation', () => {
    render(<MemoryRouter><App /></MemoryRouter>)
    expect(screen.getByText('还没有已发布工具')).toBeTruthy()
    expect(screen.getByText('显示 0 / 0 项')).toBeTruthy()
  })

  it('renders catalog metrics and quick-start entries from the server catalog', () => {
    catalog.current = { tools, loading: false, error: null }
    render(<MemoryRouter><App /></MemoryRouter>)

    const metrics = within(screen.getByLabelText('工具平台数据'))
    expect(metrics.getByText('可用工具').previousElementSibling?.textContent).toBe('05')
    expect(metrics.getByText('功能分类').previousElementSibling?.textContent).toBe('04')
    expect(screen.getAllByText('JSON 格式化').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '网络工具 1' })).toBeTruthy()
  })

  it('groups API-provided tools under accessible sidebar category regions', () => {
    catalog.current = { tools, loading: false, error: null }
    render(<MemoryRouter><App /></MemoryRouter>)

    const navigation = screen.getByRole('navigation', { name: '工具导航' })
    const workspaceHeading = screen.getByRole('heading', { name: '工作区' })
    expect(navigation.contains(workspaceHeading)).toBe(false)
    expect(workspaceHeading.compareDocumentPosition(navigation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByLabelText('5 个可用工具').textContent).toBe('5 项')
    const developerGroup = within(navigation).getByRole('region', { name: '开发工具' })
    expect(within(developerGroup).getAllByRole('link')).toHaveLength(2)
    expect(within(developerGroup).getByRole('link', { name: 'JSON 格式化' })).toBeTruthy()
    expect(within(developerGroup).getByRole('link', { name: '哈希计算' })).toBeTruthy()
    expect(within(developerGroup).getByRole('heading', { name: '开发工具' }).getAttribute('data-count')).toBe('2')
    expect(within(navigation).getByRole('link', { name: '控制台' }).closest('.nav-group')).toBeNull()
  })

  it('keeps the console outside the scrolling tools while retaining one navigation landmark', () => {
    catalog.current = { tools, loading: false, error: null }
    render(<MemoryRouter><App /></MemoryRouter>)
    const nav = screen.getByRole('navigation', { name: '工具导航' })
    const home = within(nav).getByRole('link', { name: '控制台' })
    const tool = within(nav).getByRole('link', { name: '哈希计算' })
    expect(home.closest('.navigation-home')).not.toBeNull()
    expect(home.closest('.navigation-tools')).toBeNull()
    expect(tool.closest('.navigation-tools')).not.toBeNull()
    fireEvent.click(tool)
    fireEvent.click(home)
    expect(home.getAttribute('aria-current')).toBe('page')
  })

  it('exposes category chips as one filter group and keeps filtering across directory views', () => {
    catalog.current = { tools, loading: false, error: null }
    render(<MemoryRouter><App /></MemoryRouter>)
    const chips = screen.getByRole('group', { name: '按分类筛选工具' })
    const image = within(chips).getByRole('button', { name: '图片工具 1' })
    fireEvent.click(image)
    const directory = screen.getByRole('region', { name: '工具目录' })
    expect(within(directory).getAllByRole('link')).toHaveLength(1)
    expect(image.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '列表' }))
    expect(within(directory).getAllByRole('link')).toHaveLength(1)
    fireEvent.click(within(chips).getByRole('button', { name: '全部 5' }))
    expect(within(directory).getAllByRole('link')).toHaveLength(tools.length)
  })

  it('filters live by tool description and clears a no-result search', () => {
    catalog.current = { tools, loading: false, error: null }
    render(<MemoryRouter><App /></MemoryRouter>)
    const search = screen.getByRole('searchbox', { name: '搜索工具' })

    fireEvent.change(search, { target: { value: '摘要' } })
    expect(screen.getByText('显示 1 / 5 项')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '哈希计算' })).toBeTruthy()

    fireEvent.change(search, { target: { value: '不存在的工具' } })
    expect(screen.getByText('没有找到匹配工具')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '清除筛选' }))
    expect(search).toHaveProperty('value', '')
    expect(screen.getByText('显示 5 / 5 项')).toBeTruthy()
  })

  it('filters the real navigation catalog without filtering the main directory', () => {
    catalog.current = { tools, loading: false, error: null }
    render(<MemoryRouter><App /></MemoryRouter>)
    fireEvent.change(screen.getByRole('textbox', { name: '筛选导航工具' }), { target: { value: '摘要' } })
    const nav = within(screen.getByRole('navigation', { name: '工具导航' }))
    expect(nav.getByRole('link', { name: '哈希计算' })).toBeTruthy()
    expect(nav.queryByRole('link', { name: 'JSON 格式化' })).toBeNull()
    expect(screen.getByText('显示 5 / 5 项')).toBeTruthy()
  })

  it('switches directory density without changing the actual catalog', () => {
    catalog.current = { tools, loading: false, error: null }
    const view = render(<MemoryRouter><App /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: '列表' }))
    expect(view.container.querySelector('.dashboard')?.getAttribute('data-directory-view')).toBe('list')
    expect(view.container.querySelectorAll('.dashboard-tool-card')).toHaveLength(tools.length)
    fireEvent.click(screen.getByRole('button', { name: '卡片' }))
    expect(view.container.querySelectorAll('.dashboard-tool-card')).toHaveLength(tools.length)
  })

  it('reveals search matches in collapsed groups and restores the collapse after clearing', () => {
    catalog.current = { tools, loading: false, error: null }
    render(<MemoryRouter><App /></MemoryRouter>)
    const group = within(screen.getByRole('navigation', { name: '工具导航' })).getByRole('button', { name: '开发工具' })
    fireEvent.click(group)
    expect(group.getAttribute('aria-expanded')).toBe('false')
    const search = screen.getByRole('textbox', { name: '筛选导航工具' })
    fireEvent.change(search, { target: { value: '摘要' } })
    expect(group.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('navigation', { name: '工具导航' }).querySelector('.nav-group-tools')?.hasAttribute('inert')).toBe(false)
    fireEvent.change(search, { target: { value: '' } })
    expect(group.getAttribute('aria-expanded')).toBe('false')
  })

  it('keeps focus layout consistent across edition switches without adding a visit', () => {
    catalog.current = { tools, loading: false, error: null }
    const view = render(<MemoryRouter initialEntries={['/tools/hash']}><App /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: '专注工作' }))
    expect(view.container.querySelector('.tool-page')?.classList.contains('is-studio-focused')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '经典版' }))
    expect(screen.queryByRole('button', { name: '完整布局' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '现代版' }))
    expect(screen.getByRole('button', { name: '完整布局' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '完整布局' }))
    expect(view.container.querySelector('.tool-page')?.classList.contains('is-studio-focused')).toBe(false)
    expect(api.recordToolUsage).toHaveBeenCalledTimes(1)
  })

  it('filters by category and focuses search with the slash shortcut', () => {
    catalog.current = { tools, loading: false, error: null }
    render(<MemoryRouter><App /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: '网络工具 1' }))
    expect(screen.getByText('显示 1 / 5 项')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '坐标转换' })).toBeTruthy()

    const search = screen.getByRole('searchbox', { name: '搜索工具' })
    fireEvent.keyDown(window, { key: '/' })
    expect(document.activeElement).toBe(search)
  })

  it('keeps the other-tools category at the end of sidebar and directory', () => {
    catalog.current = { tools, loading: false, error: null }
    render(<MemoryRouter><App /></MemoryRouter>)
    const categoryHeadings = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
    expect(categoryHeadings.at(-1)).toBe('其他工具')
    const navGroups = document.querySelectorAll('.nav-group h2')
    expect(navGroups.item(navGroups.length - 1).textContent).toBe('其他工具')
  })

  it('renders the API-provided image tools as their own directory', () => {
    catalog.current = { tools, loading: false, error: null }
    render(<MemoryRouter><App /></MemoryRouter>)
    expect(screen.getByRole('button', { name: '图片工具 1' })).toBeTruthy()
    expect(screen.getAllByText('图片格式转换').length).toBeGreaterThan(0)
  })

  it('renders an API-provided password tool in the password directory', () => {
    const passwordTool: ToolDescriptor = {
      slug: 'password-generator',
      displayName: '密码生成器',
      description: '生成随机密码、开发者令牌与口令短语',
      categoryCode: 'password',
      iconKey: 'password',
      routePath: '/tools/password-generator',
      executionMode: 'CLIENT',
      frontendKey: 'password.generator.v1',
    }
    catalog.current = { tools: [...tools, passwordTool], loading: false, error: null }
    render(<MemoryRouter><App /></MemoryRouter>)

    expect(screen.getByRole('button', { name: '密码工具 1' })).toBeTruthy()
    expect(screen.getAllByText('密码生成器').length).toBeGreaterThan(0)
  })

  it('preloads a direct tool route while the server catalog is still loading', () => {
    catalog.current = { tools: [], loading: true, error: null }

    render(<MemoryRouter initialEntries={['/tools/hash']}><App /></MemoryRouter>)

    expect(screen.getByText('正在确认工具配置…')).toBeTruthy()
    expect(registry.preloadClientToolBySlug).toHaveBeenCalledWith('hash')
    expect(screen.getByRole('navigation', { name: '工具导航' }).querySelector('[aria-current]')).toBeNull()
    expect(api.recordToolUsage).not.toHaveBeenCalled()
  })

  it('records a refreshed or directly opened tool once under StrictMode', () => {
    catalog.current = { tools, loading: false, error: null }

    render(<StrictMode><MemoryRouter initialEntries={['/tools/hash']}><App /></MemoryRouter></StrictMode>)

    expect(api.recordToolUsage).toHaveBeenCalledTimes(1)
    expect(api.recordToolUsage).toHaveBeenCalledWith('hash')
  })

  it('records a sidebar tool click once while navigating immediately', () => {
    catalog.current = { tools, loading: false, error: null }
    render(<MemoryRouter><App /></MemoryRouter>)

    const navigation = screen.getByRole('navigation', { name: '工具导航' })
    fireEvent.click(within(navigation).getByRole('link', { name: '哈希计算' }))

    expect(api.recordToolUsage).toHaveBeenCalledTimes(1)
    expect(api.recordToolUsage).toHaveBeenCalledWith('hash')
    expect(within(navigation).getByRole('link', { name: '哈希计算' }).getAttribute('aria-current')).toBe('page')
  })

  it('records clicks from quick start and the tool directory', () => {
    catalog.current = { tools, loading: false, error: null }
    const firstRender = render(<MemoryRouter><App /></MemoryRouter>)

    const quickStart = screen.getByRole('region', { name: '快速开始' })
    fireEvent.click(within(quickStart).getByRole('link', { name: /世界时间/ }))
    expect(api.recordToolUsage).toHaveBeenLastCalledWith('world-time')

    firstRender.unmount()
    api.recordToolUsage.mockClear()
    render(<MemoryRouter><App /></MemoryRouter>)
    const directory = screen.getByRole('region', { name: '工具目录' })
    fireEvent.click(within(directory).getByRole('link', { name: /哈希计算/ }))
    expect(api.recordToolUsage).toHaveBeenCalledTimes(1)
    expect(api.recordToolUsage).toHaveBeenCalledWith('hash')
  })

  it.each(['/tools/hash', '/tools/hash/', '/tools/hash?mode=text#result'])('selects only the current tool on direct entry to %s', (path) => {
    catalog.current = { tools, loading: false, error: null }
    render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
    const nav = screen.getByRole('navigation', { name: '工具导航' })
    expect(within(nav).getByRole('link', { name: '哈希计算' }).getAttribute('aria-current')).toBe('page')
    expect(within(nav).getByRole('link', { name: '控制台' }).hasAttribute('aria-current')).toBe(false)
    expect(nav.querySelectorAll('[aria-current="page"]').length).toBe(1)
    expect(api.recordToolUsage).toHaveBeenCalledTimes(1)
    expect(api.recordToolUsage).toHaveBeenCalledWith('hash')
  })

  it('brings the selected tool into view after direct navigation', () => {
    const scrollIntoView = vi.fn()
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    catalog.current = { tools, loading: false, error: null }

    try {
      render(<MemoryRouter initialEntries={['/tools/world-time']}><App /></MemoryRouter>)
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView
    }
  })

  it('keeps selection synchronized with link navigation and browser history', () => {
    catalog.current = { tools, loading: false, error: null }
    function HistoryControls() {
      const navigate = useNavigate()
      return <><button onClick={() => navigate(-1)}>后退</button><button onClick={() => navigate(1)}>前进</button></>
    }
    render(<MemoryRouter><App /><HistoryControls /></MemoryRouter>)
    const nav = screen.getByRole('navigation', { name: '工具导航' })
    const expectSelection = (name: string) => {
      expect(nav.querySelectorAll('[aria-current="page"]').length).toBe(1)
      expect(within(nav).getByRole('link', { name }).getAttribute('aria-current')).toBe('page')
    }
    expectSelection('控制台')
    fireEvent.click(within(nav).getByRole('link', { name: '哈希计算' }))
    expectSelection('哈希计算')
    fireEvent.click(within(nav).getByRole('link', { name: '世界时间' }))
    expectSelection('世界时间')
    fireEvent.click(screen.getByRole('button', { name: '后退' }))
    expectSelection('哈希计算')
    fireEvent.click(screen.getByRole('button', { name: '前进' }))
    expectSelection('世界时间')
    expect(api.recordToolUsage).toHaveBeenCalledTimes(4)
    fireEvent.click(within(nav).getByRole('link', { name: '控制台' }))
    expectSelection('控制台')
  })

  it('does not add an unavailable tool to navigation and selects home after redirect', () => {
    catalog.current = { tools: tools.filter((tool) => tool.slug !== 'hash'), loading: false, error: null }
    render(<MemoryRouter initialEntries={['/tools/hash']}><App /></MemoryRouter>)
    const nav = screen.getByRole('navigation', { name: '工具导航' })
    expect(within(nav).queryByRole('link', { name: '哈希计算' })).toBeNull()
    expect(within(nav).getByRole('link', { name: '控制台' }).getAttribute('aria-current')).toBe('page')
    expect(nav.querySelectorAll('[aria-current="page"]').length).toBe(1)
  })
})
