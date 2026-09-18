INSERT INTO tool_definition (
    slug, display_name, description, category_code, icon_key, route_path,
    execution_mode, frontend_key, backend_key, enabled, sort_order
) VALUES (
    'api-test',
    '接口测试',
    '配置并发送多种 HTTP 请求，查看格式化响应、Headers 与分阶段耗时分析',
    'developer',
    'api',
    '/tools/api-test',
    'CLIENT',
    'developer.api.test.v1',
    NULL,
    TRUE,
    60
);
