-- Keep V11 immutable; only update the description, preserving availability and ordering.
UPDATE tool_definition
SET description = 'Unix 时间戳与日期时间双向转换，支持秒、毫秒、时区与批量处理'
WHERE slug = 'timestamp-converter';
