INSERT INTO tool_definition (
    slug, display_name, description, category_code, icon_key, route_path,
    execution_mode, frontend_key, backend_key, enabled, sort_order
) VALUES (
    'dns-query',
    'DNS 查询',
    '由服务端并行查询多个公共 DNS，比较 A、AAAA、CNAME、MX、TXT、NS、CAA 记录、TTL 与解析链路',
    'developer',
    'network',
    '/tools/dns-query',
    'HYBRID',
    'developer.dns.diagnostics.v1',
    'developer.dns.diagnostics.v1',
    TRUE,
    80
) AS new
ON DUPLICATE KEY UPDATE display_name = new.display_name, description = new.description,
 category_code = new.category_code, icon_key = new.icon_key, route_path = new.route_path,
 frontend_key = new.frontend_key, backend_key = new.backend_key, execution_mode = new.execution_mode,
 enabled = new.enabled, sort_order = new.sort_order;
