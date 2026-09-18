INSERT INTO tool_definition (
    slug, display_name, description, category_code, icon_key, route_path,
    execution_mode, frontend_key, backend_key, enabled, sort_order
) VALUES (
    'common-ports',
    '常用端口查询',
    '查询常用网络端口对应的默认服务、TCP/UDP 协议、用途分类、加密特征与使用说明，支持搜索筛选和一键复制',
    'developer',
    'network',
    '/tools/common-ports',
    'CLIENT',
    'developer.common.ports.v1',
    NULL,
    TRUE,
    90
) AS new
ON DUPLICATE KEY UPDATE display_name = new.display_name, description = new.description,
 category_code = new.category_code, icon_key = new.icon_key, route_path = new.route_path,
 frontend_key = new.frontend_key, backend_key = new.backend_key, execution_mode = new.execution_mode,
 enabled = new.enabled, sort_order = new.sort_order;
