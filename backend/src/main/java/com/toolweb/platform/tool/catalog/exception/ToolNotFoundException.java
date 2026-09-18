package com.toolweb.platform.tool.catalog.exception;

public class ToolNotFoundException extends RuntimeException {

    public ToolNotFoundException(String slug) {
        super("No tool is registered with slug '%s'.".formatted(slug));
    }
}

