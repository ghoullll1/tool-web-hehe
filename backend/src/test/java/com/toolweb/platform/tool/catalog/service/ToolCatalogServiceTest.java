package com.toolweb.platform.tool.catalog.service;

import com.toolweb.platform.tool.catalog.dao.ToolDefinitionMapper;
import com.toolweb.platform.tool.catalog.entity.ToolDefinition;
import com.toolweb.platform.tool.catalog.exception.ToolNotFoundException;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ToolCatalogServiceTest {

    @Test
    void incrementsPublishedUsageAtomically() {
        var mapper = mock(ToolDefinitionMapper.class);
        when(mapper.incrementPublishedUsage("hash")).thenReturn(1);

        new ToolCatalogService(mapper).incrementUsage("hash");

        verify(mapper).incrementPublishedUsage("hash");
    }

    @Test
    void rejectsUsageForAnUnknownOrDisabledTool() {
        var mapper = mock(ToolDefinitionMapper.class);
        when(mapper.incrementPublishedUsage("missing")).thenReturn(0);

        assertThatThrownBy(() -> new ToolCatalogService(mapper).incrementUsage("missing"))
                .isInstanceOf(ToolNotFoundException.class);
    }

    @Test
    void persistsAvailabilityChangesExplicitly() {
        var mapper = mock(ToolDefinitionMapper.class);
        var definition = mock(ToolDefinition.class);
        when(mapper.selectBySlug("json-formatter")).thenReturn(Optional.of(definition));
        when(mapper.updateById(definition)).thenReturn(1);

        new ToolCatalogService(mapper).setAvailability("json-formatter", false);

        verify(definition).setEnabled(false);
        verify(mapper).updateById(definition);
    }

    @Test
    void rejectsAnOptimisticLockConflict() {
        var mapper = mock(ToolDefinitionMapper.class);
        var definition = mock(ToolDefinition.class);
        when(mapper.selectBySlug("json-formatter")).thenReturn(Optional.of(definition));
        when(mapper.updateById(definition)).thenReturn(0);

        assertThatThrownBy(() -> new ToolCatalogService(mapper)
                .setAvailability("json-formatter", true))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("json-formatter");
    }
}
