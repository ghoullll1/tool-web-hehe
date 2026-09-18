package com.toolweb.platform.tool.catalog.dto;

import com.toolweb.platform.tool.catalog.entity.ExecutionMode;

public record ToolDescriptor(
        String slug,
        String displayName,
        String description,
        String categoryCode,
        String iconKey,
        String routePath,
        ExecutionMode executionMode,
        String frontendKey
) {
}

