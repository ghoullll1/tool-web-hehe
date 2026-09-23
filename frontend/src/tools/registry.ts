import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { ToolDescriptor } from '../types/tool'

export interface ToolViewProps {
  tool: ToolDescriptor
}

type ToolComponent = LazyExoticComponent<ComponentType<ToolViewProps>>
type ToolModule = { default: ComponentType<ToolViewProps> }
type ToolModuleLoader = () => Promise<ToolModule>

interface ClientToolRegistration {
  slug: string
  component: ToolComponent
  preload: () => Promise<void>
}

function registerClientTool(slug: string, loadModule: ToolModuleLoader): ClientToolRegistration {
  let modulePromise: Promise<ToolModule> | undefined

  const load = () => {
    if (!modulePromise) {
      modulePromise = loadModule().catch((error: unknown) => {
        modulePromise = undefined
        throw error
      })
    }
    return modulePromise
  }

  return {
    slug,
    component: lazy(load),
    preload: async () => {
      await load()
    },
  }
}

/**
 * Extension point for browser tools.
 * Add a lazy import here and put the same stable key in tool_definition.frontend_key.
 */
const clientToolRegistrations = [
  ['developer.json.format.v1', registerClientTool('json-formatter', () => import('./json-formatter/JsonFormatterTool'))],
  ['developer.data.convert.v1', registerClientTool('data-converter', () => import('./data-converter/DataConverterTool'))],
  ['developer.json.diff.v1', registerClientTool('json-diff', () => import('./json-diff/JsonDiffTool'))],
  ['developer.hash.v1', registerClientTool('hash', () => import('./hash/HashTool'))],
  ['developer.sql.format.v1', registerClientTool('sql-formatter', () => import('./sql-formatter/SqlFormatterTool'))],
  ['developer.coordinate.convert.v1', registerClientTool('coordinate', () => import('./coordinate/CoordinateTool'))],
  ['developer.api.test.v1', registerClientTool('api-test', () => import('./api-test/ApiTestTool'))],
  ['developer.datetime.v1', registerClientTool('timestamp-converter', () => import('./timestamp/TimestampTool'))],
  ['developer.http.diagnostics.v1', registerClientTool('http-response-diagnostics', () => import('./http-diagnostics/HttpDiagnosticsTool'))],
  ['developer.dns.diagnostics.v1', registerClientTool('dns-query', () => import('./dns-diagnostics/DnsDiagnosticsTool'))],
  ['developer.common.ports.v1', registerClientTool('common-ports', () => import('./common-ports/CommonPortsTool'))],
  ['pdf.merge.v1', registerClientTool('pdf-merge', () => import('./pdf-merge/PdfMergeTool'))],
  ['pdf.image.convert.v1', registerClientTool('pdf-image-converter', () => import('./pdf-image/PdfImageTool'))],
  ['document.convert.markdown.v1', registerClientTool('document-converter', () => import('./document-converter/DocumentConverterTool'))],
  ['graphics.image.convert.v1', registerClientTool('image-converter', () => import('./image-converter/ImageConverterTool'))],
  ['password.generator.v1', registerClientTool('password-generator', () => import('./password-generator/PasswordGeneratorTool'))],
  ['utilities.world-time.v1', registerClientTool('world-time', () => import('./world-time/WorldTimeTool'))],
  ['utilities.temporary.file.share.v1', registerClientTool('temporary-file-share', () => import('./temporary-file-share/TemporaryFileShareTool'))],
  ['utilities.temporary.chat.v1', registerClientTool('temporary-chat', () => import('./temporary-chat/TemporaryChatTool'))],
] as const

const clientToolRegistry = Object.freeze(Object.fromEntries(
  clientToolRegistrations.map(([frontendKey, registration]) => [frontendKey, registration.component]),
)) as Readonly<Record<string, ToolComponent>>

const clientToolPreloads = Object.freeze(Object.fromEntries(
  clientToolRegistrations.map(([, registration]) => [registration.slug, registration.preload]),
)) as Readonly<Record<string, () => Promise<void>>>

export function resolveClientTool(frontendKey: string | null): ToolComponent | undefined {
  return frontendKey ? clientToolRegistry[frontendKey] : undefined
}

export function preloadClientToolBySlug(slug: string): Promise<void> | undefined {
  return clientToolPreloads[slug]?.()
}
