package com.toolweb.platform.tool.execution.service;

import com.toolweb.platform.tool.catalog.dao.ToolDefinitionMapper;
import com.toolweb.platform.tool.catalog.entity.ExecutionMode;
import com.toolweb.platform.tool.catalog.exception.ToolNotExecutableException;
import com.toolweb.platform.tool.catalog.exception.ToolNotFoundException;
import com.toolweb.platform.tool.execution.model.ToolExecutionContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

@Service
@Transactional(readOnly = true)
public class ToolExecutionService {

    private final ToolDefinitionMapper mapper;
    private final ToolExecutorRegistry registry;

    public ToolExecutionService(ToolDefinitionMapper mapper, ToolExecutorRegistry registry) {
        this.mapper = mapper;
        this.registry = registry;
    }

    public Map<String, Object> execute(
            String slug,
            Map<String, Object> input,
            String requestId,
            Locale locale
    ) {
        var definition = mapper.selectPublishedBySlug(slug)
                .orElseThrow(() -> new ToolNotFoundException(slug));

        if (definition.executionMode() == ExecutionMode.CLIENT) {
            throw new ToolNotExecutableException("Tool '%s' runs only in the browser.".formatted(slug));
        }

        var backendKey = definition.backendKey();
        if (backendKey == null || backendKey.isBlank()) {
            throw new ToolNotExecutableException("Tool '%s' has no backend implementation key.".formatted(slug));
        }

        return registry.require(backendKey)
                .execute(
                        Collections.unmodifiableMap(new LinkedHashMap<>(input)),
                        new ToolExecutionContext(requestId, locale));
    }
}
