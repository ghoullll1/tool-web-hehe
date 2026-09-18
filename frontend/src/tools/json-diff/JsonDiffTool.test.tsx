// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolDescriptor } from '../../types/tool'
import JsonDiffTool from './JsonDiffTool'

afterEach(cleanup)

const tool: ToolDescriptor = {
  slug: 'json-diff',
  displayName: 'JSON 对比',
  description: 'test',
  categoryCode: 'developer',
  iconKey: 'diff',
  routePath: '/tools/json-diff',
  executionMode: 'CLIENT',
  frontendKey: 'developer.json.diff.v1',
}

describe('JsonDiffTool', () => {
  it('highlights both sides of changed values and summarizes every difference kind', () => {
    render(<JsonDiffTool tool={tool} />)

    expect(screen.getByText('+ 2 新增')).toBeTruthy()
    expect(screen.getByText('− 1 删除')).toBeTruthy()
    expect(screen.getByText('~ 3 修改')).toBeTruthy()

    const versionRow = screen.getByRole('button', { name: '修改 $.version' })
    const leftValue = versionRow.querySelector('.json-diff-value.is-left')
    const rightValue = versionRow.querySelector('.json-diff-value.is-right')
    expect(leftValue?.textContent).toContain('1')
    expect(rightValue?.textContent).toContain('2')
    expect(leftValue?.classList.contains('is-changed')).toBe(true)
    expect(rightValue?.classList.contains('is-changed')).toBe(true)
  })

  it('ignores formatting and key order when comparing edited inputs', () => {
    render(<JsonDiffTool tool={tool} />)
    fireEvent.change(screen.getByLabelText('原始 JSON输入'), {
      target: { value: '{"a":1,"nested":{"x":true,"y":2}}' },
    })
    fireEvent.change(screen.getByLabelText('目标 JSON输入'), {
      target: { value: '{\n  "nested": {"y": 2, "x": true},\n  "a": 1\n}' },
    })

    fireEvent.click(screen.getByRole('button', { name: '开始对比' }))

    expect(screen.getByText('内容一致')).toBeTruthy()
    expect(screen.getByText(/忽略缩进和字段顺序/)).toBeTruthy()
  })

  it('automatically compares pasted JSON and reports the invalid side', () => {
    render(<JsonDiffTool tool={tool} />)
    const leftInput = screen.getByLabelText('原始 JSON输入') as HTMLTextAreaElement
    const rightInput = screen.getByLabelText('目标 JSON输入') as HTMLTextAreaElement
    leftInput.setSelectionRange(0, leftInput.value.length)
    fireEvent.paste(leftInput, {
      clipboardData: { getData: () => rightInput.value },
    })
    expect(screen.getByText('内容一致')).toBeTruthy()

    fireEvent.change(rightInput, { target: { value: '{"broken":}' } })
    fireEvent.click(screen.getByRole('button', { name: '开始对比' }))

    expect(screen.getByRole('alert').textContent).toContain('目标 JSON')
    expect(screen.getByRole('alert').textContent).toContain('第 1 行')
  })
})
