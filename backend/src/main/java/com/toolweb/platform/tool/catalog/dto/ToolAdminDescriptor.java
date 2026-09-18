package com.toolweb.platform.tool.catalog.dto;

import com.toolweb.platform.tool.catalog.entity.ExecutionMode;

public record ToolAdminDescriptor(
        long id,
        String slug,
        String displayName,
        String categoryCode,
        ExecutionMode executionMode,
        String frontendKey,
        String backendKey,
        boolean enabled,
        int sortOrder,
        long usageCount
) {
}
