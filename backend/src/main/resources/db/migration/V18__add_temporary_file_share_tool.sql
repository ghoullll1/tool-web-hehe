CREATE TABLE IF NOT EXISTS temporary_file_share (
    share_id CHAR(36) NOT NULL,
    access_key_digest VARBINARY(32) NOT NULL,
    object_key VARCHAR(64) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(120) NOT NULL,
    size_bytes BIGINT NOT NULL,
    sha256 CHAR(64) NOT NULL,
    expires_at TIMESTAMP(6) NOT NULL,
    download_count INT NOT NULL DEFAULT 0,
    max_downloads INT NOT NULL DEFAULT 1,
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP(6) NOT NULL,
    consumed_at TIMESTAMP(6) NULL,
    version BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (share_id),
    CONSTRAINT uk_temporary_file_share_object_key UNIQUE (object_key),
    CONSTRAINT ck_temporary_file_share_size CHECK (size_bytes > 0),
    CONSTRAINT ck_temporary_file_share_downloads CHECK (
        download_count >= 0 AND max_downloads > 0 AND download_count <= max_downloads
    ),
    CONSTRAINT ck_temporary_file_share_status CHECK (status IN ('ACTIVE', 'CONSUMED')),
    INDEX idx_temporary_file_share_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO tool_definition (
    slug, display_name, description, category_code, icon_key, route_path,
    execution_mode, frontend_key, backend_key, enabled, sort_order
) VALUES (
    'temporary-file-share',
    '文件临时分享',
    '上传文件并生成密钥分享链接，固定五分钟有效且仅允许下载一次',
    'other',
    'share',
    '/tools/temporary-file-share',
    'HYBRID',
    'utilities.temporary.file.share.v1',
    'utilities.temporary.file.share.v1',
    TRUE,
    320
) AS new
ON DUPLICATE KEY UPDATE display_name = new.display_name, description = new.description,
 category_code = new.category_code, icon_key = new.icon_key, route_path = new.route_path,
 frontend_key = new.frontend_key, backend_key = new.backend_key, execution_mode = new.execution_mode,
 enabled = new.enabled, sort_order = new.sort_order;
