package com.toolweb.platform.tool.catalog.service;

import com.toolweb.platform.tool.catalog.dao.ToolDefinitionMapper;
import com.toolweb.platform.tool.catalog.dto.ToolAdminDescriptor;
import com.toolweb.platform.tool.catalog.dto.ToolDescriptor;
import com.toolweb.platform.tool.catalog.entity.ToolDefinition;
import com.toolweb.platform.tool.catalog.exception.ToolNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@Transactional(readOnly = true)
public class ToolCatalogService {

    private final ToolDefinitionMapper mapper;

    public ToolCatalogService(ToolDefinitionMapper mapper) {
        this.mapper = mapper;
    }

    public List<ToolDescriptor> listPublished() {
        return mapper.selectPublished()
                .stream()
                .map(this::toDescriptor)
                .toList();
    }

    public List<ToolAdminDescriptor> listAll() {
        return mapper.selectAllOrdered()
                .stream()
                .map(this::toAdminDescriptor)
                .toList();
    }

    @Transactional
    public void incrementUsage(String slug) {
        if (mapper.incrementPublishedUsage(slug) != 1) {
            throw new ToolNotFoundException(slug);
        }
    }

    @Transactional
    public ToolAdminDescriptor setAvailability(String slug, boolean enabled) {
        var definition = mapper.selectBySlug(slug)
                .orElseThrow(() -> new ToolNotFoundException(slug));
        definition.setEnabled(enabled);
        if (mapper.updateById(definition) != 1) {
            throw new IllegalStateException("Tool availability changed concurrently: " + slug);
        }
        return toAdminDescriptor(definition);
    }

    private ToolDescriptor toDescriptor(ToolDefinition definition) {
        return new ToolDescriptor(
                definition.slug(),
                definition.displayName(),
                definition.description(),
                definition.categoryCode(),
                definition.iconKey(),
                definition.routePath(),
                definition.executionMode(),
                definition.frontendKey());
    }

    private ToolAdminDescriptor toAdminDescriptor(ToolDefinition definition) {
        return new ToolAdminDescriptor(
                definition.id(),
                definition.slug(),
                definition.displayName(),
                definition.categoryCode(),
                definition.executionMode(),
                definition.frontendKey(),
                definition.backendKey(),
                definition.enabled(),
                definition.sortOrder(),
                definition.usageCount());
    }
}
