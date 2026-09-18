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
    'hash',
    '哈希计算',
    '在线计算 MD5、SHA、SHA3、RIPEMD160 与 HMAC，支持文本逐行和文件分块处理',
    'developer',
    'hash',
    '/tools/hash',
    'CLIENT',
    'developer.hash.v1',
    NULL,
    TRUE,
    120
);
