package com.toolweb.platform.tool.execution.exception;

import java.util.List;

public class ToolInputException extends RuntimeException {

    private final List<String> errors;

    public ToolInputException(String message, Throwable cause) {
        super(message, cause);
        this.errors = List.of(message);
    }

    public ToolInputException(String message, List<String> errors) {
        super(message);
        this.errors = List.copyOf(errors);
    }

    public List<String> errors() {
        return errors;
    }
}
