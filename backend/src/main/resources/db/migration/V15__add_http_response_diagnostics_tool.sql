INSERT INTO tool_definition (
    slug, display_name, description, category_code, icon_key, route_path,
    execution_mode, frontend_key, backend_key, enabled, sort_order
) VALUES (
    'http-response-diagnostics',
    'HTTP 响应诊断',
    '由服务端安全探测公开 HTTP 地址，分析状态码、重定向、响应头、压缩、缓存策略与连接耗时',
    'developer',
    'network',
    '/tools/http-response-diagnostics',
    'HYBRID',
    'developer.http.diagnostics.v1',
    'developer.http.diagnostics.v1',
    TRUE,
    70
) AS new
ON DUPLICATE KEY UPDATE display_name = new.display_name, description = new.description,
 category_code = new.category_code, icon_key = new.icon_key, route_path = new.route_path,
 frontend_key = new.frontend_key, backend_key = new.backend_key, execution_mode = new.execution_mode,
 enabled = new.enabled, sort_order = new.sort_order;
