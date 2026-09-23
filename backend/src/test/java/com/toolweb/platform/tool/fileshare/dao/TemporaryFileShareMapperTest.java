package com.toolweb.platform.tool.fileshare.dao;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.toolweb.platform.tool.fileshare.entity.TemporaryFileShare;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class TemporaryFileShareMapperTest {

    @Test
    void mapsAutoIncrementPrimaryKeyLogicalDeleteAndOptimisticVersionFields() throws Exception {
        assertThat(TemporaryFileShare.class.getAnnotation(TableName.class).value())
                .isEqualTo("temporary_file_share");
        var tableId = TemporaryFileShare.class.getDeclaredField("id").getAnnotation(TableId.class);
        assertThat(tableId).isNotNull();
        assertThat(tableId.value()).isEqualTo("id");
        assertThat(tableId.type()).isEqualTo(IdType.AUTO);
        assertThat(TemporaryFileShare.class.getDeclaredField("shareId").getAnnotation(TableId.class))
                .isNull();
        assertThat(TemporaryFileShare.class.getDeclaredField("deleted").getAnnotation(TableLogic.class))
                .isNotNull();
        assertThat(TemporaryFileShare.class.getDeclaredField("version").getAnnotation(Version.class))
                .isNotNull();
        assertThat(BaseMapper.class.isAssignableFrom(TemporaryFileShareMapper.class)).isTrue();
    }

    @Test
    void keepsLockingAndLogicalDeletionExplicitInCustomSql() throws Exception {
        final String sql;
        try (var input = new ClassPathResource("mapper/fileshare/TemporaryFileShareMapper.xml").getInputStream()) {
            sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }

        assertThat(sql)
                .containsIgnoringCase("id, share_id")
                .containsIgnoringCase("object_key, object_path, original_filename")
                .containsIgnoringCase("deleted = FALSE")
                .containsIgnoringCase("WHERE pickup_code_digest = #{pickupCodeDigest}")
                .containsIgnoringCase("FOR UPDATE");
        assertThat(sql)
                .containsIgnoringCase("deleted = TRUE")
                .containsIgnoringCase("deleted_at = #{deletedAt}")
                .containsIgnoringCase("version = #{version}");
    }

    @Test
    void migratesToNumericPrimaryKeyAndKeepsShareIdUnique() throws Exception {
        final String migration;
        try (var input = new ClassPathResource(
                "db/migration/V24__add_temporary_file_share_numeric_primary_key.sql").getInputStream()) {
            migration = new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }

        assertThat(migration)
                .containsIgnoringCase("DROP PRIMARY KEY")
                .containsIgnoringCase("ADD COLUMN id BIGINT NOT NULL AUTO_INCREMENT FIRST")
                .containsIgnoringCase("ADD PRIMARY KEY (id)")
                .containsIgnoringCase("UNIQUE (share_id)");
    }

    @Test
    void addsUniqueNullableDigestWithoutDeletingHistory() throws Exception {
        try (var input = new ClassPathResource("db/migration/V29__add_temporary_file_pickup_code.sql").getInputStream()) {
            assertThat(new String(input.readAllBytes(), StandardCharsets.UTF_8))
                    .containsIgnoringCase("pickup_code_digest CHAR(64) NULL")
                    .containsIgnoringCase("UNIQUE (pickup_code_digest)")
                    .doesNotContainIgnoringCase("DROP ")
                    .doesNotContainIgnoringCase("DELETE FROM");
        }
    }

    @Test
    void addsABucketRelativeObjectPathWithoutChangingTheStableObjectKey() throws Exception {
        final String migration;
        try (var input = new ClassPathResource(
                "db/migration/V27__add_temporary_file_share_object_path.sql").getInputStream()) {
            migration = new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }

        assertThat(migration)
                .containsIgnoringCase("ADD COLUMN object_path VARCHAR(1024) NULL AFTER object_key")
                .doesNotContainIgnoringCase("endpoint")
                .doesNotContainIgnoringCase("http://")
                .doesNotContainIgnoringCase("https://");
    }
}
