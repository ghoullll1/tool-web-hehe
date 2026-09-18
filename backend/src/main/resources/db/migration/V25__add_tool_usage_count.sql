ALTER TABLE tool_definition
    ADD COLUMN usage_count BIGINT NOT NULL DEFAULT 0 AFTER sort_order,
    ADD CONSTRAINT ck_tool_definition_usage_count CHECK (usage_count >= 0);
