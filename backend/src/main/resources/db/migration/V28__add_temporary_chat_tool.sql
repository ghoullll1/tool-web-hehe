CREATE TABLE IF NOT EXISTS temporary_chat_session (
    id BIGINT NOT NULL AUTO_INCREMENT,
    session_id CHAR(36) NOT NULL,
    session_key_digest CHAR(64) NOT NULL,
    creator_client_id CHAR(36) NOT NULL,
    creator_display_name VARCHAR(32) NULL,
    participant_client_id CHAR(36) NULL,
    participant_display_name VARCHAR(32) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'WAITING',
    created_at TIMESTAMP(6) NOT NULL,
    join_deadline_at TIMESTAMP(6) NOT NULL,
    creator_connected_at TIMESTAMP(6) NULL,
    participant_connected_at TIMESTAMP(6) NULL,
    connected_at TIMESTAMP(6) NULL,
    creator_last_message_at TIMESTAMP(6) NULL,
    participant_last_message_at TIMESTAMP(6) NULL,
    closed_at TIMESTAMP(6) NULL,
    close_reason VARCHAR(32) NULL,
    version BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    CONSTRAINT uk_temporary_chat_session_id UNIQUE (session_id),
    CONSTRAINT uk_temporary_chat_session_key_digest UNIQUE (session_key_digest),
    CONSTRAINT ck_temporary_chat_status CHECK (status IN ('WAITING', 'ACTIVE', 'EXPIRED', 'CLOSED')),
    INDEX idx_temporary_chat_waiting (status, join_deadline_at),
    INDEX idx_temporary_chat_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO tool_definition (
    slug, display_name, description, category_code, icon_key, route_path,
    execution_mode, frontend_key, backend_key, enabled, sort_order
) VALUES (
    'temporary-chat',
    '临时会话',
    '通过一次性会话密钥建立双人实时聊天，三分钟等待与活跃检测，服务端不保存消息内容',
    'other',
    'chat',
    '/tools/temporary-chat',
    'HYBRID',
    'utilities.temporary.chat.v1',
    'utilities.temporary.chat.v1',
    TRUE,
    330
) AS new
ON DUPLICATE KEY UPDATE display_name = new.display_name, description = new.description,
 category_code = new.category_code, icon_key = new.icon_key, route_path = new.route_path,
 frontend_key = new.frontend_key, backend_key = new.backend_key, execution_mode = new.execution_mode,
 enabled = new.enabled, sort_order = new.sort_order;
