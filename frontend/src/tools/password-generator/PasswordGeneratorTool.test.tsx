// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolDescriptor } from '../../types/tool'
import PasswordGeneratorTool from './PasswordGeneratorTool'

const tool: ToolDescriptor = {
  slug: 'password-generator',
  displayName: '密码生成器',
  description: '生成随机密码、开发者令牌与口令短语',
  categoryCode: 'password',
  iconKey: 'password',
  routePath: '/tools/password-generator',
  executionMode: 'CLIENT',
  frontendKey: 'password.generator.v1',
}

const writeText = vi.fn(async () => undefined)

beforeEach(() => {
  writeText.mockClear()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
})

afterEach(cleanup)

describe('PasswordGeneratorTool', () => {
  it('starts with readable random-password results and all three modes', () => {
    render(<PasswordGeneratorTool tool={tool} />)
    expect(screen.getByRole('heading', { name: '每一次生成，都只属于此刻。' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /随机密码/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /开发者令牌/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /口令短语/ })).toBeTruthy()
    expect(document.querySelectorAll('.password-result-list article')).toHaveLength(5)
    expect(screen.getAllByText(/约 \d+ bits/).length).toBeGreaterThan(1)
  })

  it('switches to developer tokens and applies a visible API-key prefix', () => {
    render(<PasswordGeneratorTool tool={tool} />)
    fireEvent.click(screen.getByRole('button', { name: /开发者令牌/ }))
    expect(screen.getByRole('heading', { name: '开发者令牌设置' })).toBeTruthy()
    const formatGroup = screen.getByRole('group', { name: '令牌格式' })
    expect(within(formatGroup).getByRole('button', { name: /API Key/ }).getAttribute('aria-pressed')).toBe('true')
    const prefix = screen.getByRole('textbox', { name: '令牌前缀' })
    fireEvent.change(prefix, { target: { value: 'ci_test_' } })
    const result = document.querySelector('.password-result-list code')?.textContent ?? ''
    expect(result.startsWith('ci_test_')).toBe(true)
  })

  it('supports Chinese passphrases and changes the generated batch size', () => {
    render(<PasswordGeneratorTool tool={tool} />)
    fireEvent.click(screen.getByRole('button', { name: /口令短语/ }))
    fireEvent.click(screen.getByRole('button', { name: '中文词库' }))
    fireEvent.click(screen.getByRole('button', { name: '减少生成数量' }))
    expect(document.querySelectorAll('.password-result-list article')).toHaveLength(4)
    expect(document.querySelector('.password-result-list code')?.textContent).toMatch(/[\u4e00-\u9fff]/)
  })

  it('hides values without changing what is copied', async () => {
    render(<PasswordGeneratorTool tool={tool} />)
    const firstValue = document.querySelector('.password-result-list code')?.textContent ?? ''
    fireEvent.click(screen.getByRole('button', { name: /隐藏/ }))
    expect(document.querySelector('.password-result-list code')?.textContent).toMatch(/^•+$/)
    fireEvent.click(screen.getByRole('button', { name: '复制第 1 条结果' }))
    expect(writeText).toHaveBeenCalledWith(firstValue)
    expect(await screen.findByText('第 1 条结果已复制')).toBeTruthy()
  })

  it('prevents disabling the last password character group', () => {
    render(<PasswordGeneratorTool tool={tool} />)
    fireEvent.click(screen.getByRole('button', { name: /大写字母/ }))
    fireEvent.click(screen.getByRole('button', { name: /数字/ }))
    fireEvent.click(screen.getByRole('button', { name: /特殊符号/ }))
    fireEvent.click(screen.getByRole('button', { name: /小写字母/ }))
    expect(screen.getByRole('alert').textContent).toContain('至少保留一类字符')
    expect(screen.getByRole('button', { name: /小写字母/ }).getAttribute('aria-pressed')).toBe('true')
  })
})
