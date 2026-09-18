// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ToolDescriptor } from '../../types/tool'
import ApiTestTool from './ApiTestTool'

const tool: ToolDescriptor = { slug: 'api-test', displayName: '接口测试', description: 'test', categoryCode: 'developer', iconKey: 'api', routePath: '/tools/api-test', executionMode: 'CLIENT', frontendKey: 'developer.api.test.v1' }
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('ApiTestTool', () => {
  it('configures query, headers, auth, and body modes', () => {
    render(<ApiTestTool tool={tool} />)
    expect((screen.getByLabelText('接口地址') as HTMLInputElement).value).toBe('')
    expect(screen.getByPlaceholderText('示例：https://api.example.com/v1/resource')).toBeTruthy()
    expect(screen.getByText('Query 参数')).toBeTruthy()
    expect((screen.getByLabelText('Query 参数名称') as HTMLInputElement).value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: '请求 Headers' }))
    expect(screen.getByText('请求 Headers')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '请求 Auth' }))
    fireEvent.change(screen.getByLabelText('认证类型'), { target: { value: 'bearer' } })
    expect(screen.getByLabelText('Bearer Token')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('HTTP 请求方法'))
    fireEvent.click(screen.getByRole('option', { name: 'POST' }))
    fireEvent.click(screen.getByRole('button', { name: '请求 Body' }))
    fireEvent.click(screen.getByRole('button', { name: 'JSON' }))
    expect(screen.getByLabelText('JSON Body')).toBeTruthy()
  })

  it('shows a formatted response and timing analysis', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"ok"}', { status: 200, headers: { 'Content-Type': 'application/json', 'X-Test': 'yes' } })))
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    render(<ApiTestTool tool={tool} />)
    fireEvent.change(screen.getByLabelText('接口地址'), { target: { value: 'https://api.example.com/status' } })
    fireEvent.click(screen.getByRole('button', { name: /发送/ }))
    expect(await screen.findByText(/"message": "ok"/)).toBeTruthy()
    expect(screen.getByText('200')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '响应 Timing' }))
    expect(screen.getByText('总耗时')).toBeTruthy()
    expect(screen.getByText('等待响应')).toBeTruthy()
  })

  it('shows the actual request URL and copies different request formats', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } })))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(<ApiTestTool tool={tool} />)
    fireEvent.change(screen.getByLabelText('接口地址'), { target: { value: 'https://api.example.com/search' } })
    fireEvent.change(screen.getByLabelText('Query 参数名称'), { target: { value: 'search' } })
    fireEvent.change(screen.getByLabelText('Query 参数值'), { target: { value: 'hello world' } })
    fireEvent.click(screen.getByRole('button', { name: /发送/ }))
    await screen.findByText('200')
    fireEvent.click(screen.getByRole('button', { name: '实际请求' }))
    expect(screen.getAllByText(/search=hello\+world/).length).toBeGreaterThanOrEqual(2)
    fireEvent.click(screen.getByRole('button', { name: 'Python requests' }))
    expect(screen.getByText(/requests\.request/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '复制代码' }))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('requests.request'))
  })

  it('reports invalid JSON before making a request', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    render(<ApiTestTool tool={tool} />)
    fireEvent.change(screen.getByLabelText('接口地址'), { target: { value: 'https://api.example.com/items' } })
    fireEvent.click(screen.getByLabelText('HTTP 请求方法'))
    fireEvent.click(screen.getByRole('option', { name: 'POST' }))
    fireEvent.click(screen.getByRole('button', { name: '请求 Body' }))
    fireEvent.click(screen.getByRole('button', { name: 'JSON' }))
    fireEvent.change(screen.getByLabelText('JSON Body'), { target: { value: '{bad' } })
    fireEvent.click(screen.getByRole('button', { name: /发送/ }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('JSON Body'))
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('removes sensitive authentication values when clearing the request', () => {
    render(<ApiTestTool tool={tool} />)
    fireEvent.click(screen.getByRole('button', { name: '请求 Auth' }))
    fireEvent.change(screen.getByLabelText('认证类型'), { target: { value: 'bearer' } })
    fireEvent.change(screen.getByLabelText('Bearer Token'), { target: { value: 'sensitive-token' } })
    fireEvent.click(screen.getByRole('button', { name: '清空请求' }))
    fireEvent.change(screen.getByLabelText('认证类型'), { target: { value: 'bearer' } })
    expect((screen.getByLabelText('Bearer Token') as HTMLInputElement).value).toBe('')
  })

  it('uses an accessible custom method picker', () => {
    render(<ApiTestTool tool={tool} />)
    const trigger = screen.getByLabelText('HTTP 请求方法')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(within(screen.getByRole('listbox', { name: 'HTTP 请求方法选项' })).getAllByRole('option')).toHaveLength(7)
    fireEvent.keyDown(screen.getByRole('option', { name: 'GET' }), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByRole('option', { name: 'POST' }))
    fireEvent.click(screen.getByRole('option', { name: 'PATCH' }))
    expect(trigger).toHaveProperty('textContent', expect.stringContaining('PATCH'))
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('keeps query rows editable while independently enabling, adding, and removing them', () => {
    render(<ApiTestTool tool={tool} />)
    const nameInput = screen.getByLabelText('Query 参数名称') as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: 'page' } })

    const enableControl = screen.getByLabelText('启用 page') as HTMLInputElement
    expect(enableControl.checked).toBe(true)
    expect(enableControl.closest('.api-pair-row')?.classList.contains('is-enabled')).toBe(true)

    fireEvent.click(enableControl)
    expect(enableControl.checked).toBe(false)
    expect(enableControl.closest('.api-pair-row')?.classList.contains('is-disabled')).toBe(true)
    expect(nameInput.disabled).toBe(false)
    expect(screen.getByText('0 项已启用')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '新增参数' }))
    const pairNames = screen.getAllByLabelText('Query 参数名称') as HTMLInputElement[]
    expect(pairNames).toHaveLength(2)
    expect(document.activeElement).toBe(pairNames[1])
    expect(screen.getByLabelText('Query 参数编辑区')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '删除 空行' }))
    expect(screen.getAllByLabelText('Query 参数名称')).toHaveLength(1)
    expect((screen.getByLabelText('Query 参数名称') as HTMLInputElement).value).toBe('page')
  })

  it('selects a query parameter type and sends its normalized value', async () => {
    const fetcher = vi.fn(async () => new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetcher)
    render(<ApiTestTool tool={tool} />)
    fireEvent.change(screen.getByLabelText('接口地址'), { target: { value: 'https://api.example.com/search' } })
    fireEvent.change(screen.getByLabelText('Query 参数名称'), { target: { value: 'enabled' } })
    fireEvent.change(screen.getByLabelText('Query 参数值'), { target: { value: 'TRUE' } })
    const typeTrigger = screen.getByLabelText('Query 参数类型 1')
    fireEvent.click(typeTrigger)
    expect(typeTrigger.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(screen.getByRole('option', { name: /Boolean/ }))
    expect(typeTrigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.change(screen.getByLabelText('Query 参数说明 1'), { target: { value: '是否启用' } })
    fireEvent.click(screen.getByRole('button', { name: /发送/ }))
    await screen.findByText('200')
    expect(fetcher).toHaveBeenCalledWith('https://api.example.com/search?enabled=true', expect.any(Object))
  })
})
