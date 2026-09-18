package com.toolweb.platform.tool.execution.exception;

public class ToolUpstreamException extends RuntimeException {

    private final boolean timeout;

    public ToolUpstreamException(String message, boolean timeout, Throwable cause) {
        super(message, cause);
        this.timeout = timeout;
    }

    public boolean timeout() {
        return timeout;
    }
}
