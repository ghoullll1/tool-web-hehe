import { describe, expect, it } from 'vitest'
import { preloadClientToolBySlug, resolveClientTool } from './registry'

describe('client tool registry', () => {
  it('preloads a registered route through the same lazy-component registry', async () => {
    const preload = preloadClientToolBySlug('hash')

    expect(preload).toBeInstanceOf(Promise)
    await preload
    expect(resolveClientTool('developer.hash.v1')).toBeDefined()
  })

  it('ignores an unknown route without loading a component', () => {
    expect(preloadClientToolBySlug('missing-tool')).toBeUndefined()
  })

  it('preloads the image converter from its catalog slug', async () => {
    await preloadClientToolBySlug('image-converter')
    expect(resolveClientTool('graphics.image.convert.v1')).toBeDefined()
  })

  it('preloads the data format converter from its catalog slug', async () => {
    await preloadClientToolBySlug('data-converter')
    expect(resolveClientTool('developer.data.convert.v1')).toBeDefined()
  })

  it('preloads the password generator from its catalog slug', async () => {
    await preloadClientToolBySlug('password-generator')
    expect(resolveClientTool('password.generator.v1')).toBeDefined()
  })

  it('preloads the HTTP diagnostics workbench from its catalog slug', async () => {
    await preloadClientToolBySlug('http-response-diagnostics')
    expect(resolveClientTool('developer.http.diagnostics.v1')).toBeDefined()
  })

  it('preloads the DNS diagnostics workbench from its catalog slug', async () => {
    await preloadClientToolBySlug('dns-query')
    expect(resolveClientTool('developer.dns.diagnostics.v1')).toBeDefined()
  })

  it('preloads the common-port reference from its catalog slug', async () => {
    await preloadClientToolBySlug('common-ports')
    expect(resolveClientTool('developer.common.ports.v1')).toBeDefined()
  })

  it('preloads the temporary file sharing workbench from its catalog slug', async () => {
    await preloadClientToolBySlug('temporary-file-share')
    expect(resolveClientTool('utilities.temporary.file.share.v1')).toBeDefined()
  })

  it('preloads the temporary chat workbench from its catalog slug', async () => {
    await preloadClientToolBySlug('temporary-chat')
    expect(resolveClientTool('utilities.temporary.chat.v1')).toBeDefined()
  })

  it('preloads the document conversion workbench from its catalog slug', async () => {
    await preloadClientToolBySlug('document-converter')
    expect(resolveClientTool('document.convert.markdown.v1')).toBeDefined()
  })
})
