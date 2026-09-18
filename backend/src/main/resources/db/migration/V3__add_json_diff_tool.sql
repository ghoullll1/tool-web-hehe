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
    'json-diff',
    'JSON 对比',
    '按字段比较两份 JSON，定位新增、删除与修改内容，数据仅在浏览器本地处理',
    'developer',
    'diff',
    '/tools/json-diff',
    'CLIENT',
    'developer.json.diff.v1',
    NULL,
    TRUE,
    110
);
