/** Presentation only. Catalog membership and tool behavior always come from the API. */
export const studioProfiles = {
  'timestamp-converter': { family: 'time', tone: 'amber', label: '时间实验室' },
  'common-ports': { family: 'network', tone: 'blue', label: '网络图鉴' },
  'json-formatter': { family: 'code', tone: 'blue', label: '结构编辑室' },
  'data-converter': { family: 'code', tone: 'indigo', label: '配置工作室' },
  'json-diff': { family: 'code', tone: 'rose', label: '差异观察室' },
  hash: { family: 'code', tone: 'slate', label: '摘要实验室' },
  'sql-formatter': { family: 'code', tone: 'amber', label: '查询编辑室' },
  coordinate: { family: 'time', tone: 'blue', label: '坐标工作室' },
  'api-test': { family: 'network', tone: 'amber', label: '接口工作台' },
  'http-response-diagnostics': { family: 'network', tone: 'blue', label: '请求观察室' },
  'dns-query': { family: 'network', tone: 'indigo', label: '解析观察室' },
  'image-converter': { family: 'image', tone: 'rose', label: '影像工作室' },
  'password-generator': { family: 'security', tone: 'indigo', label: '密钥实验室' },
  'pdf-merge': { family: 'document', tone: 'amber', label: '文档装订室' },
  'pdf-image-converter': { family: 'document', tone: 'rose', label: '文档影像室' },
  'document-converter': { family: 'document', tone: 'amber', label: '文档阅读室' },
  'world-time': { family: 'time', tone: 'slate', label: '环球时钟' },
  'temporary-file-share': { family: 'sharing', tone: 'blue', label: '文件投递站' },
  'temporary-chat': { family: 'chat', tone: 'rose', label: '双人会客室' },
} as const
export function studioProfile(slug: string) {
  return studioProfiles[slug as keyof typeof studioProfiles] ?? { family: 'code', tone: 'slate', label: '工具工作室' }
}
