package com.toolweb.platform.tool.fileshare.exception;

public class FileShareAccessException extends RuntimeException {

    public enum Reason {
        INVALID,
        EXPIRED,
        CONSUMED
    }

    private final Reason reason;

    public FileShareAccessException(Reason reason) {
        super(reason.name());
        this.reason = reason;
    }

    public Reason reason() {
        return reason;
    }
}
