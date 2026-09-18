ALTER TABLE temporary_file_share
    DROP PRIMARY KEY,
    ADD COLUMN id BIGINT NOT NULL AUTO_INCREMENT FIRST,
    ADD PRIMARY KEY (id),
    ADD CONSTRAINT uk_temporary_file_share_share_id UNIQUE (share_id);
