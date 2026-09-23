package com.toolweb.platform.architecture;

import com.toolweb.platform.tool.catalog.dao.ToolDefinitionMapper;
import com.toolweb.platform.tool.catalog.service.ToolCatalogService;
import com.toolweb.platform.tool.document.controller.DocumentConversionController;
import com.toolweb.platform.tool.document.service.DocumentConversionService;
import com.toolweb.platform.tool.fileshare.dao.TemporaryFileShareMapper;
import com.toolweb.platform.tool.fileshare.service.TemporaryFileShareService;
import com.toolweb.platform.tool.temporarychat.dao.TemporaryChatSessionMapper;
import com.toolweb.platform.tool.temporarychat.service.TemporaryChatService;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.session.Configuration;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;

class BackendPackageArchitectureTest {

    @Test
    void keepsBusinessHttpAndPersistenceTypesInTheirNamedLayers() {
        assertThat(ToolCatalogService.class.getPackageName()).endsWith(".catalog.service");
        assertThat(DocumentConversionService.class.getPackageName()).endsWith(".document.service");
        assertThat(TemporaryFileShareService.class.getPackageName()).endsWith(".fileshare.service");
        assertThat(DocumentConversionController.class.getPackageName()).endsWith(".document.controller");
        assertThat(ToolDefinitionMapper.class.getPackageName()).endsWith(".catalog.dao");
        assertThat(TemporaryFileShareMapper.class.getPackageName()).endsWith(".fileshare.dao");
        assertThat(TemporaryChatService.class.getPackageName()).endsWith(".temporarychat.service");
        assertThat(TemporaryChatSessionMapper.class.getPackageName()).endsWith(".temporarychat.dao");
    }

    @Test
    void keepsCustomSqlOutOfMapperAnnotationsAndInMapperResources() {
        assertThat(hasStatementAnnotation(ToolDefinitionMapper.class)).isFalse();
        assertThat(hasStatementAnnotation(TemporaryFileShareMapper.class)).isFalse();
        assertThat(hasStatementAnnotation(TemporaryChatSessionMapper.class)).isFalse();
        assertThat(new ClassPathResource("mapper/catalog/ToolDefinitionMapper.xml").exists()).isTrue();
        assertThat(new ClassPathResource("mapper/fileshare/TemporaryFileShareMapper.xml").exists()).isTrue();
        assertThat(new ClassPathResource("mapper/temporarychat/TemporaryChatSessionMapper.xml").exists()).isTrue();
    }

    @Test
    void parsesMapperXmlAndKeepsAllSqlParameterBound() throws IOException {
        var configuration = new Configuration();
        parseMapper(configuration, "mapper/catalog/ToolDefinitionMapper.xml");
        parseMapper(configuration, "mapper/fileshare/TemporaryFileShareMapper.xml");
        parseMapper(configuration, "mapper/temporarychat/TemporaryChatSessionMapper.xml");

        assertThat(configuration.hasStatement(ToolDefinitionMapper.class.getName() + ".selectPublished")).isTrue();
        assertThat(configuration.hasStatement(TemporaryFileShareMapper.class.getName() + ".selectForUpdate")).isTrue();
        assertThat(configuration.hasStatement(TemporaryFileShareMapper.class.getName() + ".markDeleted")).isTrue();
        assertThat(configuration.hasStatement(TemporaryChatSessionMapper.class.getName() + ".reserveParticipant")).isTrue();
        assertThat(configuration.hasStatement(TemporaryChatSessionMapper.class.getName() + ".closeSession")).isTrue();
    }

    private boolean hasStatementAnnotation(Class<?> mapperType) {
        return Arrays.stream(mapperType.getDeclaredMethods())
                .flatMap(method -> Arrays.stream(method.getAnnotations()))
                .map(annotation -> annotation.annotationType().getPackageName())
                .anyMatch("org.apache.ibatis.annotations"::equals);
    }

    private void parseMapper(Configuration configuration, String path) throws IOException {
        var resource = new ClassPathResource(path);
        try (var input = resource.getInputStream()) {
            var xml = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            assertThat(xml).doesNotContain("${");
        }
        try (var input = resource.getInputStream()) {
            new XMLMapperBuilder(input, configuration, path, configuration.getSqlFragments()).parse();
        }
    }
}
