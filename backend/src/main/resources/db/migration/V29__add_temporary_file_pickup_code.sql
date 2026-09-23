ALTER TABLE temporary_file_share
    ADD COLUMN pickup_code_digest CHAR(64) NULL AFTER access_key_digest,
    ADD CONSTRAINT uk_temporary_file_share_pickup UNIQUE (pickup_code_digest);

-- Retain digests on historical rows: an old code/link must never resolve to a new file.
-- Existing records are not converted: their five-minute lifetime and cleanup remain unchanged.
UPDATE tool_definition
SET description = '上传文件生成 8 位取件码，支持扫码与链接接收，固定五分钟有效且仅允许下载一次'
WHERE slug = 'temporary-file-share';
