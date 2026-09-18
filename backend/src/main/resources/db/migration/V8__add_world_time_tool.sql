INSERT INTO tool_definition (
    slug, display_name, description, category_code, icon_key, route_path,
    execution_mode, frontend_key, backend_key, enabled, sort_order
) VALUES (
    'world-time',
    '世界时间',
    '实时查看全球城市时间，支持时区搜索、指定时间换算与夏令时偏移',
    'other',
    'clock',
    '/tools/world-time',
    'CLIENT',
    'utilities.world-time.v1',
    NULL,
    TRUE,
    300
);
