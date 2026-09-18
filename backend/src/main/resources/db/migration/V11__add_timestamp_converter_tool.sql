INSERT INTO tool_definition (
    slug, display_name, description, category_code, icon_key, route_path,
    execution_mode, frontend_key, backend_key, enabled, sort_order
) VALUES (
    'timestamp-converter',
    '时间戳转换',
    'Unix 时间戳与日期时间双向转换，支持秒、毫秒、微秒、纳秒、时区与批量处理',
    'developer',
    'clock',
    '/tools/timestamp-converter',
    'CLIENT',
    'developer.datetime.v1',
    NULL,
    TRUE,
    65
) AS new
ON DUPLICATE KEY UPDATE display_name = new.display_name, description = new.description,
 category_code = new.category_code, icon_key = new.icon_key, route_path = new.route_path,
 frontend_key = new.frontend_key, execution_mode = new.execution_mode,
 enabled = new.enabled, sort_order = new.sort_order;
