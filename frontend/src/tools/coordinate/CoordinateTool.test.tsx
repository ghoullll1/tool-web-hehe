// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolDescriptor } from '../../types/tool'
import CoordinateTool from './CoordinateTool'

afterEach(cleanup)

const tool: ToolDescriptor = {
  slug: 'coordinate',
  displayName: '地图坐标系转换',
  description: 'test',
  categoryCode: 'developer',
  iconKey: 'coordinate',
  routePath: '/tools/coordinate',
  executionMode: 'CLIENT',
  frontendKey: 'developer.coordinate.convert.v1',
}

describe('CoordinateTool', () => {
  it('shows all three coordinate systems and updates live from one coordinate', () => {
    render(<CoordinateTool tool={tool} />)
    expect(screen.getByText('各地图可用坐标')).toBeTruthy()
    expect(screen.getAllByText('WGS84').length).toBeGreaterThan(0)
    expect(screen.getAllByText('GCJ-02').length).toBeGreaterThan(0)
    expect(screen.getAllByText('BD-09').length).toBeGreaterThan(0)
    fireEvent.change(screen.getByLabelText('单个坐标'), { target: { value: '121.4737,31.2304' } })
    expect(screen.getByRole('status').textContent).toContain('实时检查')
  })

  it('reports invalid ranges without leaving misleading results', () => {
    render(<CoordinateTool tool={tool} />)
    fireEvent.change(screen.getByLabelText('单个坐标'), { target: { value: '200,31' } })
    expect(screen.getByRole('alert').textContent).toContain('经度')
    expect(screen.getAllByText('等待有效坐标')).toHaveLength(3)
  })

  it('switches to batch mode, converts rows, and invalidates stale results on edit', () => {
    render(<CoordinateTool tool={tool} />)
    fireEvent.click(screen.getByRole('button', { name: '批量转换' }))
    expect(screen.getByText('3 个坐标')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('批量坐标输入'), { target: { value: '地点A,116.397128,39.916527' } })
    expect(screen.getByText('等待批量转换')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '开始转换' }))
    expect(screen.getByText('1 个坐标')).toBeTruthy()
    expect(screen.getByText('地点A')).toBeTruthy()
  })

  it('supports source/target card selection and coordinate order changes', () => {
    render(<CoordinateTool tool={tool} />)
    fireEvent.click(screen.getByRole('button', { name: '批量转换' }))
    const baiduButtons = screen.getAllByRole('button', { name: /BD-09百度地图/ })
    fireEvent.click(baiduButtons[1]!)
    expect(screen.getByRole('status').textContent).toContain('目标坐标系已更新')
    fireEvent.click(screen.getAllByRole('button', { name: '纬度, 经度' })[0]!)
    expect(screen.getByRole('status').textContent).toContain('输入顺序已更新')
  })
})
