INSERT INTO tool_definition (
    slug, display_name, description, category_code, icon_key, route_path,
    execution_mode, frontend_key, backend_key, enabled, sort_order
) VALUES (
    'document-converter',
    '文档转 Markdown',
    '将 PDF、Word、PowerPoint、Excel、HTML、文本等文档安全转换为 Markdown，单个文件最大 10 MB',
    'pdf',
    'document',
    '/tools/document-converter',
    'HYBRID',
    'document.convert.markdown.v1',
    'document.convert.markdown.v1',
    TRUE,
    230
) AS new
ON DUPLICATE KEY UPDATE display_name = new.display_name, description = new.description,
 category_code = new.category_code, icon_key = new.icon_key, route_path = new.route_path,
 frontend_key = new.frontend_key, backend_key = new.backend_key, execution_mode = new.execution_mode,
 enabled = new.enabled, sort_order = new.sort_order;
