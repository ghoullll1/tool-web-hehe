package com.toolweb.platform.tool.catalog.dao;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.Version;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.toolweb.platform.tool.catalog.entity.ToolDefinition;
import org.apache.ibatis.annotations.Mapper;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class ToolDefinitionMapperTest {

    @Test
    void mapsTheCatalogEntityAndMapperToMybatisPlus() throws Exception {
        assertThat(ToolDefinition.class.getAnnotation(TableName.class).value())
                .isEqualTo("tool_definition");
        assertThat(ToolDefinition.class.getDeclaredField("version").getAnnotation(Version.class))
                .isNotNull();
        assertThat(ToolDefinition.class.getDeclaredField("usageCount").getAnnotation(TableField.class).updateStrategy())
                .isEqualTo(FieldStrategy.NEVER);
        assertThat(BaseMapper.class.isAssignableFrom(ToolDefinitionMapper.class)).isTrue();
        assertThat(ToolDefinitionMapper.class.getAnnotation(Mapper.class)).isNotNull();

        try (var input = new ClassPathResource("mapper/catalog/ToolDefinitionMapper.xml").getInputStream()) {
            var xml = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            assertThat(xml)
                    .contains("com.toolweb.platform.tool.catalog.dao.ToolDefinitionMapper")
                    .contains("selectPublished")
                    .contains("selectPublishedBySlug")
                    .contains("id=\"incrementPublishedUsage\"")
                    .contains("usage_count = usage_count + 1")
                    .contains("AND enabled = TRUE");
        }

        try (var input = new ClassPathResource(
                "db/migration/V25__add_tool_usage_count.sql").getInputStream()) {
            var migration = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            assertThat(migration)
                    .contains("usage_count BIGINT NOT NULL DEFAULT 0")
                    .contains("CHECK (usage_count >= 0)");
        }
    }
}
