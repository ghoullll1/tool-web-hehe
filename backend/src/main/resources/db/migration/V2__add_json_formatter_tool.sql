INSERT INTO tool_definition (
    slug,
    display_name,
    description,
    category_code,
    icon_key,
    route_path,
    execution_mode,
    frontend_key,
    backend_key,
    enabled,
    sort_order
) VALUES (
    'json-formatter',
    'JSON 格式化',
    '在线 JSON 校验、美化、压缩、排序与树形查看，数据仅在浏览器本地处理',
    'developer',
    'braces',
    '/tools/json-formatter',
    'CLIENT',
    'developer.json.format.v1',
    NULL,
    TRUE,
    100
);

