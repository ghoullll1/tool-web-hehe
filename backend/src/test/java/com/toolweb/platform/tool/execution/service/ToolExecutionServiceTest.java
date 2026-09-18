package com.toolweb.platform.tool.execution.service;

import com.toolweb.platform.tool.catalog.dao.ToolDefinitionMapper;
import com.toolweb.platform.tool.catalog.entity.ExecutionMode;
import com.toolweb.platform.tool.catalog.entity.ToolDefinition;
import com.toolweb.platform.tool.execution.model.ToolExecutionContext;
import com.toolweb.platform.tool.execution.spi.ToolExecutor;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ToolExecutionServiceTest {

    @Test
    void preservesJsonNullValuesAndPassesRequestContext() {
        var mapper = mock(ToolDefinitionMapper.class);
        var definition = mock(ToolDefinition.class);
        when(definition.executionMode()).thenReturn(ExecutionMode.SERVER);
        when(definition.backendKey()).thenReturn("server.sample.v1");
        when(mapper.selectPublishedBySlug("sample")).thenReturn(Optional.of(definition));

        var receivedInput = new AtomicReference<Map<String, Object>>();
        var receivedContext = new AtomicReference<ToolExecutionContext>();
        ToolExecutor executor = new ToolExecutor() {
            @Override
            public String key() {
                return "server.sample.v1";
            }

            @Override
            public Map<String, Object> execute(Map<String, Object> input, ToolExecutionContext context) {
                receivedInput.set(input);
                receivedContext.set(context);
                return Map.of("accepted", true);
            }
        };

        var service = new ToolExecutionService(mapper, new ToolExecutorRegistry(List.of(executor)));
        var input = new LinkedHashMap<String, Object>();
        input.put("nullable", null);

        var result = service.execute("sample", input, "request-42", Locale.SIMPLIFIED_CHINESE);

        assertThat(result).containsEntry("accepted", true);
        assertThat(receivedInput.get()).containsEntry("nullable", null);
        assertThat(receivedContext.get().requestId()).isEqualTo("request-42");
        assertThat(receivedContext.get().locale()).isEqualTo(Locale.SIMPLIFIED_CHINESE);
    }
}
