import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

const MAX_PREVIEW_CHARACTERS = 300_000

const previewComponents: Components = {
  a: ({ node, ...props }) => {
    void node
    return <a {...props} target="_blank" rel="noreferrer noopener" />
  },
  table: ({ node, ...props }) => {
    void node
    return <div className="document-markdown-table-scroll"><table {...props} /></div>
  },
  img: ({ node, alt }) => {
    void node
    return <span className="document-markdown-image-note" role="note">
      <span aria-hidden="true">▧</span>
      图片“{alt?.trim() || '未命名'}”未在预览中加载
    </span>
  },
}

export default function MarkdownPreview({ source }: { source: string }) {
  if (!source.trim()) {
    return <div className="document-markdown-preview is-empty" role="status" aria-label="Markdown 预览">
      <span aria-hidden="true">MD</span>
      <strong>没有可预览的正文</strong>
      <p>源文档可能没有可提取文本，或仅包含扫描图片。</p>
    </div>
  }

  const previewSource = source.slice(0, MAX_PREVIEW_CHARACTERS)
  const truncated = previewSource.length < source.length

  return <article className="document-markdown-preview" aria-label="Markdown 预览" tabIndex={0}>
    <Markdown remarkPlugins={[remarkGfm]} skipHtml components={previewComponents}>
      {previewSource}
    </Markdown>
    {truncated ? <div className="document-markdown-truncation" role="status">
      <strong>预览已折叠后续内容</strong>
      <span>为保持页面流畅，这里展示前 {MAX_PREVIEW_CHARACTERS.toLocaleString()} 个字符；复制和下载仍包含完整 Markdown。</span>
    </div> : null}
  </article>
}
