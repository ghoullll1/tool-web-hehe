ALTER TABLE temporary_file_share
    ADD COLUMN object_path VARCHAR(1024) NULL AFTER object_key;

