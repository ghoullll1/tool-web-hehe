package com.toolweb.platform.tool.temporarychat.exception;

public class TemporaryChatException extends RuntimeException {

    public enum Reason {
        SESSION_UNAVAILABLE,
        CAPACITY_EXCEEDED,
        INVALID_REQUEST
    }

    private final Reason reason;

    public TemporaryChatException(Reason reason, String message) {
        super(message);
        this.reason = reason;
    }

    public Reason reason() {
        return reason;
    }
}
