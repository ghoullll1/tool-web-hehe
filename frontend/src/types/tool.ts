export type ExecutionMode = 'CLIENT' | 'SERVER' | 'HYBRID'

export interface ToolDescriptor {
  slug: string
  displayName: string
  description: string
  categoryCode: string
  iconKey: string
  routePath: string
  executionMode: ExecutionMode
  frontendKey: string | null
}

