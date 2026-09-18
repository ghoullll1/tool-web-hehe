// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolDescriptor } from '../../types/tool'
import CommonPortsTool from './CommonPortsTool'
import { COMMON_PORTS } from './commonPortsData'

const tool: ToolDescriptor = {
  slug: 'common-ports',
  displayName: '常用端口查询',
  description: 'test',
  categoryCode: 'developer',
  iconKey: 'network',
  routePath: '/tools/common-ports',
  executionMode: 'CLIENT',
  frontendKey: 'developer.common.ports.v1',
}

const writeText = vi.fn()

beforeEach(() => {
  writeText.mockReset()
  writeText.mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
})

afterEach(cleanup)

describe('CommonPortsTool', () => {
  it('starts on HTTPS with readable protocol, range and service details', () => {
    render(<CommonPortsTool tool={tool} />)

    expect(screen.getByRole('img', { name: '当前定位端口 443，服务 HTTPS' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'HTTPS' })).toBeTruthy()
    expect(screen.getByText('当前选中端口')).toBeTruthy()
    expect(screen.getByText('TCP 承载 HTTPS；UDP 通常承载基于 QUIC 的 HTTP/3。')).toBeTruthy()
    expect(screen.getAllByText('系统端口 · 0–1023').length).toBeGreaterThan(0)
  })

  it('searches by service name and copies the exact port', async () => {
    render(<CommonPortsTool tool={tool} />)
    const search = screen.getByRole('searchbox', { name: '搜索常用端口' })

    fireEvent.change(search, { target: { value: 'postgres' } })
    expect(screen.getByRole('heading', { name: 'POSTGRESQL' })).toBeTruthy()
    expect(screen.getByText('1 个匹配')).toBeTruthy()
    expect(screen.getByLabelText(`显示 1 / ${COMMON_PORTS.length} 个端口`)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '复制端口 5432' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('5432'))
    expect(screen.getByText('端口 5432 已复制')).toBeTruthy()
  })

  it('finds every Nacos port role from one service query', () => {
    render(<CommonPortsTool tool={tool} />)

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索常用端口' }), { target: { value: 'nacos' } })

    expect(screen.getByLabelText(`显示 5 / ${COMMON_PORTS.length} 个端口`)).toBeTruthy()
    expect(screen.getByRole('button', { name: '查看端口 7848 NACOS-JRAFT' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '查看端口 8848 NACOS-HTTP' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '查看端口 9848 NACOS-GRPC-CLIENT' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '查看端口 9849 NACOS-GRPC-SERVER' })).toBeTruthy()
  })

  it('shows a visible error when browser clipboard permission is denied', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'))
    render(<CommonPortsTool tool={tool} />)

    fireEvent.click(screen.getByRole('button', { name: '复制端口 443' }))

    const feedback = await screen.findByText('复制失败，请检查浏览器剪贴板权限')
    expect(feedback.classList.contains('is-visible')).toBe(true)
    expect(feedback.classList.contains('is-error')).toBe(true)
  })

  it('composes category and UDP filters and exposes an empty-state recovery', () => {
    render(<CommonPortsTool tool={tool} />)

    fireEvent.click(screen.getByRole('button', { name: '邮件 7' }))
    fireEvent.click(within(screen.getByRole('group', { name: '传输协议' })).getByRole('button', { name: 'UDP' }))
    expect(screen.getByText('没有匹配的端口')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '显示全部端口' }))
    expect(screen.getByRole('heading', { name: 'HTTPS' })).toBeTruthy()
  })

  it('focuses search with slash and opens a related port without stale filters', () => {
    render(<CommonPortsTool tool={tool} />)

    fireEvent.keyDown(window, { key: '/' })
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: '搜索常用端口' }))
    fireEvent.click(screen.getByRole('button', { name: '查看端口 8080 HTTP-ALT' }))
    expect(screen.getByRole('heading', { name: 'HTTP-ALT' })).toBeTruthy()
  })
})
