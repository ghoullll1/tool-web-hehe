ALTER TABLE temporary_file_share
    ADD COLUMN deleted BOOLEAN NOT NULL DEFAULT FALSE AFTER consumed_at;

UPDATE temporary_file_share
SET deleted = TRUE
WHERE deleted_at IS NOT NULL;

ALTER TABLE temporary_file_share
    DROP INDEX idx_temporary_file_share_active_expiry,
    ADD INDEX idx_temporary_file_share_active_expiry (deleted, expires_at);
