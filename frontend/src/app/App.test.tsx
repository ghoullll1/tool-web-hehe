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
    catalog.current = { tools: [], loading: false, error: null }
    registry.preloadClientToolBySlug.mockClear()
    api.recordToolUsage.mockClear()
  })

  afterEach(cleanup)

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
    expect(workspaceHeading.closest('.sidebar-workspace')?.nextElementSibling).toBe(navigation)
    expect(screen.getByLabelText('5 个可用工具').textContent).toBe('5 项')
    const developerGroup = within(navigation).getByRole('region', { name: '开发工具' })
    expect(within(developerGroup).getAllByRole('link')).toHaveLength(2)
    expect(within(developerGroup).getByRole('link', { name: 'JSON 格式化' })).toBeTruthy()
    expect(within(developerGroup).getByRole('link', { name: '哈希计算' })).toBeTruthy()
    expect(within(developerGroup).getByRole('heading', { name: '开发工具' }).getAttribute('data-count')).toBe('2')
    expect(within(navigation).getByRole('link', { name: '控制台' }).closest('.nav-group')).toBeNull()
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
