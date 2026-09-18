import type { ToolDescriptor } from '../types/tool'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export async function fetchPublishedTools(signal?: AbortSignal): Promise<ToolDescriptor[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/tools`, {
    headers: { Accept: 'application/json' },
    signal,
  })

  if (!response.ok) {
    throw new Error(`工具目录加载失败（HTTP ${response.status}）`)
  }

  return (await response.json()) as ToolDescriptor[]
}

export async function recordToolUsage(slug: string): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/v1/tools/${encodeURIComponent(slug)}/usage`, {
      method: 'POST',
      keepalive: true,
    })
  } catch {
    // Usage metrics are best-effort and must never prevent tool navigation.
  }
}

export async function executeServerTool(
  slug: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_BASE_URL}/api/v1/tools/${encodeURIComponent(slug)}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ input }),
    signal,
  })

  if (!response.ok) {
    let detail = `工具执行失败（HTTP ${response.status}）`
    try {
      const problem = (await response.json()) as { detail?: string; title?: string }
      detail = problem.detail || problem.title || detail
    } catch {
      // Keep the status-based fallback when an intermediary returns a non-JSON error page.
    }
    throw new Error(detail)
  }

  const body = (await response.json()) as { output: Record<string, unknown> }
  return body.output
}
