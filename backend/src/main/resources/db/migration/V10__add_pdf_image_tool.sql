INSERT INTO tool_definition (
    slug, display_name, description, category_code, icon_key, route_path,
    execution_mode, frontend_key, backend_key, enabled, sort_order
) VALUES (
    'pdf-image-converter', 'PDF 与图片转换', 'PDF 选页转 PNG/JPG，或将图片按顺序转换为 PDF，支持清晰度、纸张与边距设置',
    'pdf', 'pdf', '/tools/pdf-image-converter', 'CLIENT', 'pdf.image.convert.v1', NULL, TRUE, 220
) AS new
ON DUPLICATE KEY UPDATE display_name = new.display_name, description = new.description,
 category_code = new.category_code, route_path = new.route_path, frontend_key = new.frontend_key,
 execution_mode = new.execution_mode, enabled = new.enabled, sort_order = new.sort_order;
