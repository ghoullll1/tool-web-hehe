// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolDescriptor } from '../../types/tool'
import SqlFormatterTool from './SqlFormatterTool'

afterEach(cleanup)

const tool: ToolDescriptor = {
  slug: 'sql-formatter',
  displayName: 'SQL 格式化',
  description: 'test',
  categoryCode: 'developer',
  iconKey: 'sql',
  routePath: '/tools/sql-formatter',
  executionMode: 'CLIENT',
  frontendKey: 'developer.sql.format.v1',
}

describe('SqlFormatterTool', () => {
  it('clears stale output while editing and formats with the current rules', () => {
    render(<SqlFormatterTool tool={tool} />)
    const input = screen.getByLabelText('SQL 输入')
    expect(screen.getByLabelText('SQL 处理结果')).toBeTruthy()
    fireEvent.change(input, { target: { value: 'select id,name from users where active=1;' } })
    expect(screen.queryByLabelText('SQL 处理结果')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '格式化' }))
    expect((screen.getByLabelText('SQL 处理结果') as HTMLTextAreaElement).value).toContain('SELECT')
  })

  it('uses a custom accessible dialect picker and reapplies PostgreSQL rules', () => {
    render(<SqlFormatterTool tool={tool} />)
    fireEvent.click(screen.getByRole('button', { name: 'MySQL' }))
    const postgres = screen.getByRole('option', { name: 'PostgreSQL' })
    fireEvent.click(postgres)
    expect(screen.getByRole('button', { name: 'PostgreSQL' }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('status').textContent).toContain('规则已更新')
  })

  it('automatically formats pasted SQL and can compact it safely', () => {
    render(<SqlFormatterTool tool={tool} />)
    const input = screen.getByLabelText('SQL 输入') as HTMLTextAreaElement
    input.setSelectionRange(0, input.value.length)
    fireEvent.paste(input, { clipboardData: { getData: () => "select 'a  b' as value from users where id = 1;" } })
    expect((screen.getByLabelText('SQL 处理结果') as HTMLTextAreaElement).value).toContain('SELECT')
    fireEvent.click(screen.getByRole('button', { name: '压缩' }))
    expect((screen.getByLabelText('SQL 处理结果') as HTMLTextAreaElement).value).toContain("'a  b'")
  })

  it('reports and locates tokenization errors', () => {
    render(<SqlFormatterTool tool={tool} />)
    const input = screen.getByLabelText('SQL 输入') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'select *\nfrom users\nwhere name = §;' } })
    fireEvent.click(screen.getByRole('button', { name: '格式化' }))
    expect(screen.getByRole('alert').textContent).toContain('第 3 行')
    expect(input.selectionStart).toBe(33)
    expect(screen.getByText('格式化失败')).toBeTruthy()
  })
})
