ALTER TABLE temporary_file_share
    ADD COLUMN deleted_at TIMESTAMP(6) NULL AFTER consumed_at,
    ADD INDEX idx_temporary_file_share_active_expiry (deleted_at, expires_at);
