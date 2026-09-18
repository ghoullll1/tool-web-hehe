CREATE TABLE IF NOT EXISTS tool_definition(
    id BIGINT NOT NULL AUTO_INCREMENT,
    slug VARCHAR(100) NOT NULL,
    display_name VARCHAR(120) NOT NULL,
    description VARCHAR(500) NOT NULL,
    category_code VARCHAR(80) NOT NULL,
    icon_key VARCHAR(80) NOT NULL,
    route_path VARCHAR(180) NOT NULL,
    execution_mode VARCHAR(16) NOT NULL,
    frontend_key VARCHAR(120) NULL,
    backend_key VARCHAR(120) NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uk_tool_definition_slug UNIQUE (slug),
    CONSTRAINT ck_tool_definition_execution_mode CHECK (execution_mode IN ('CLIENT', 'SERVER', 'HYBRID')),
    CONSTRAINT ck_tool_definition_frontend_key CHECK (
        execution_mode = 'SERVER' OR frontend_key IS NOT NULL
    ),
    CONSTRAINT ck_tool_definition_backend_key CHECK (
        execution_mode = 'CLIENT' OR backend_key IS NOT NULL
    ),
    INDEX idx_tool_definition_catalog (enabled, category_code, sort_order, display_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

