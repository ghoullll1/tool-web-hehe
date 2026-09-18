package com.toolweb.platform.tool.execution.spi;

import com.toolweb.platform.tool.execution.model.ToolExecutionContext;

import java.util.Map;

/**
 * Extension point for server-side tools. Implementations are Spring beans and must expose a stable unique key.
 */
public interface ToolExecutor {

    String key();

    Map<String, Object> execute(Map<String, Object> input, ToolExecutionContext context);
}
