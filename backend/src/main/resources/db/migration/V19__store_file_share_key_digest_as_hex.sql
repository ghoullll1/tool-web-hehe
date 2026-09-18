ALTER TABLE temporary_file_share
    MODIFY COLUMN access_key_digest VARBINARY(64) NOT NULL;

UPDATE temporary_file_share
SET access_key_digest = LOWER(HEX(access_key_digest));

ALTER TABLE temporary_file_share
    MODIFY COLUMN access_key_digest CHAR(64)
        CHARACTER SET ascii
        COLLATE ascii_bin
        NOT NULL;
