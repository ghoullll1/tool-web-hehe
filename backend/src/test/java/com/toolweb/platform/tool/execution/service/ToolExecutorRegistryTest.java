package com.toolweb.platform.tool.execution.service;

import com.toolweb.platform.tool.catalog.exception.ToolNotExecutableException;
import com.toolweb.platform.tool.execution.model.ToolExecutionContext;
import com.toolweb.platform.tool.execution.spi.ToolExecutor;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ToolExecutorRegistryTest {

    @Test
    void resolvesAnExecutorByItsStableKey() {
        ToolExecutor executor = new StubExecutor("sample");
        var registry = new ToolExecutorRegistry(List.of(executor));

        assertThat(registry.require("sample")).isSameAs(executor);
    }

    @Test
    void rejectsDuplicateKeysAtStartup() {
        assertThatThrownBy(() -> new ToolExecutorRegistry(List.of(
                new StubExecutor("duplicate"),
                new StubExecutor("duplicate"))))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("duplicate");
    }

    @Test
    void reportsAnUndeployedImplementation() {
        var registry = new ToolExecutorRegistry(List.of());

        assertThatThrownBy(() -> registry.require("missing"))
                .isInstanceOf(ToolNotExecutableException.class)
                .hasMessageContaining("missing");
    }

    private record StubExecutor(String key) implements ToolExecutor {
        @Override
        public Map<String, Object> execute(Map<String, Object> input, ToolExecutionContext context) {
            return input;
        }
    }
}
