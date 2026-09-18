INSERT INTO tool_definition (
    slug, display_name, description, category_code, icon_key, route_path,
    execution_mode, frontend_key, backend_key, enabled, sort_order
) VALUES (
    'password-generator', '密码生成器', '安全生成随机密码、开发者令牌与口令短语，支持强度评估、批量生成和一键复制',
    'password', 'password', '/tools/password-generator', 'CLIENT', 'password.generator.v1', NULL, TRUE, 100
) AS new
ON DUPLICATE KEY UPDATE display_name = new.display_name, description = new.description,
 category_code = new.category_code, icon_key = new.icon_key, route_path = new.route_path,
 frontend_key = new.frontend_key, execution_mode = new.execution_mode, enabled = new.enabled,
 sort_order = new.sort_order;
