import { useEffect, useState } from 'react'
import { fetchPublishedTools } from '../api/toolCatalog'
import type { ToolDescriptor } from '../types/tool'

interface ToolCatalogState {
  tools: ToolDescriptor[]
  loading: boolean
  error: string | null
}

export function useToolCatalog(): ToolCatalogState {
  const [state, setState] = useState<ToolCatalogState>({
    tools: [],
    loading: true,
    error: null,
  })

  useEffect(() => {
    const controller = new AbortController()

    fetchPublishedTools(controller.signal)
      .then((tools) => setState({ tools, loading: false, error: null }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({
          tools: [],
          loading: false,
          error: error instanceof Error ? error.message : '工具目录加载失败',
        })
      })

    return () => controller.abort()
  }, [])

  return state
}

