INSERT INTO tool_definition (
    slug, display_name, description, category_code, icon_key, route_path,
    execution_mode, frontend_key, backend_key, enabled, sort_order
) VALUES (
    'coordinate',
    '地图坐标系转换',
    'WGS84、GCJ-02、BD-09 坐标互转，支持高德、腾讯、百度和 Google 等地图来源',
    'developer',
    'coordinate',
    '/tools/coordinate',
    'CLIENT',
    'developer.coordinate.convert.v1',
    NULL,
    TRUE,
    140
);
