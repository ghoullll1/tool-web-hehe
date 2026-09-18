// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolDescriptor } from '../../types/tool'
import HashTool from './HashTool'

afterEach(cleanup)

const tool: ToolDescriptor = {
  slug: 'hash',
  displayName: '哈希计算',
  description: 'test',
  categoryCode: 'developer',
  iconKey: 'hash',
  routePath: '/tools/hash',
  executionMode: 'CLIENT',
  frontendKey: 'developer.hash.v1',
}

describe('HashTool', () => {
  it('calculates text immediately and supports uppercase output', () => {
    render(<HashTool tool={tool} />)
    fireEvent.change(screen.getByLabelText('待计算文本'), { target: { value: 'abc' } })
    expect(screen.getByText('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '大写' }))
    expect(screen.getByText('BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD')).toBeTruthy()
  })

  it('adds algorithms without allowing the final selection to be removed', () => {
    render(<HashTool tool={tool} />)
    const md5Toggle = screen.getByRole('button', { name: '选择算法 MD5' })
    fireEvent.click(md5Toggle)
    expect(screen.getByRole('note').textContent).toContain('不适合新的安全协议')
    expect(md5Toggle.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(md5Toggle)
    fireEvent.click(screen.getByRole('button', { name: '选择算法 SHA-256' }))
    expect(screen.getByRole('alert').textContent).toContain('至少保留一种')
    fireEvent.change(screen.getByLabelText('待计算文本'), { target: { value: 'new input' } })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('requires an HMAC key and calculates again after it is entered', () => {
    render(<HashTool tool={tool} />)
    fireEvent.click(screen.getByRole('button', { name: 'HMAC 签名' }))
    expect(screen.getByRole('alert').textContent).toContain('需要填写密钥')
    fireEvent.change(screen.getByLabelText('HMAC 密钥'), { target: { value: 'key' } })
    fireEvent.change(screen.getByLabelText('待计算文本'), { target: { value: 'The quick brown fox jumps over the lazy dog' } })
    expect(screen.getByText('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8')).toBeTruthy()
  })

  it('renders independent rows in per-line mode', () => {
    render(<HashTool tool={tool} />)
    fireEvent.change(screen.getByLabelText('待计算文本'), { target: { value: 'alpha\nbeta' } })
    fireEvent.click(screen.getByRole('checkbox', { name: '按行独立计算' }))
    expect(screen.getByText('L1')).toBeTruthy()
    expect(screen.getByText('L2')).toBeTruthy()
    expect(screen.getByTitle('alpha')).toBeTruthy()
    expect(screen.getByTitle('beta')).toBeTruthy()
  })
})
