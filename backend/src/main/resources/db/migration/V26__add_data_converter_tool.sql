INSERT INTO tool_definition (
    slug, display_name, description, category_code, icon_key, route_path,
    execution_mode, frontend_key, backend_key, enabled, sort_order
) VALUES (
    'data-converter',
    '数据格式转换',
    '在浏览器本地完成 JSON、YAML 与 Properties 的结构化互转、格式化、路径合并、重复配置处理与递归排序',
    'developer',
    'json',
    '/tools/data-converter',
    'CLIENT',
    'developer.data.convert.v1',
    NULL,
    TRUE,
    105
) AS new
ON DUPLICATE KEY UPDATE display_name = new.display_name, description = new.description,
 category_code = new.category_code, icon_key = new.icon_key, route_path = new.route_path,
 frontend_key = new.frontend_key, backend_key = new.backend_key, execution_mode = new.execution_mode,
 enabled = new.enabled, sort_order = new.sort_order;
