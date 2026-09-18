package com.toolweb.platform.tool.execution.service;

import com.toolweb.platform.tool.catalog.exception.ToolNotExecutableException;
import com.toolweb.platform.tool.execution.spi.ToolExecutor;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
public class ToolExecutorRegistry {

    private final Map<String, ToolExecutor> executors;

    public ToolExecutorRegistry(List<ToolExecutor> executorBeans) {
        var registry = new HashMap<String, ToolExecutor>();
        for (var executor : executorBeans) {
            var previous = registry.put(executor.key(), executor);
            if (previous != null) {
                throw new IllegalStateException("Duplicate tool executor key: " + executor.key());
            }
        }
        this.executors = Map.copyOf(registry);
    }

    public ToolExecutor require(String key) {
        var executor = executors.get(key);
        if (executor == null) {
            throw new ToolNotExecutableException("No backend implementation is deployed for key '%s'.".formatted(key));
        }
        return executor;
    }
}
