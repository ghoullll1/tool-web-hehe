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
    'sql-formatter',
    'SQL 格式化',
    '支持 MySQL、PostgreSQL、SQL Server、Oracle 等多种数据库方言的 SQL 美化与压缩',
    'developer',
    'sql',
    '/tools/sql-formatter',
    'CLIENT',
    'developer.sql.format.v1',
    NULL,
    TRUE,
    130
);
