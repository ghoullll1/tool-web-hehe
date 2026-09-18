INSERT INTO tool_definition (
    slug, display_name, description, category_code, icon_key, route_path,
    execution_mode, frontend_key, backend_key, enabled, sort_order
) VALUES (
    'pdf-merge',
    'PDF 合并',
    '在浏览器本地合并多个 PDF，支持文件排序、页数统计与结果下载',
    'pdf',
    'pdf',
    '/tools/pdf-merge',
    'CLIENT',
    'pdf.merge.v1',
    NULL,
    TRUE,
    210
);
