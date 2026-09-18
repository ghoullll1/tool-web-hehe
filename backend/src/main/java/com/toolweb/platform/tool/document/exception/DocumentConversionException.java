package com.toolweb.platform.tool.document.exception;

public final class DocumentConversionException extends RuntimeException {

    public enum Reason {
        EMPTY_FILE,
        FILE_TOO_LARGE,
        UNSUPPORTED_EXTENSION,
        INVALID_FILENAME,
        CAPACITY_EXCEEDED,
        CONVERSION_FAILED,
        OUTPUT_TOO_LARGE,
        WORKER_UNAVAILABLE,
        WORKER_TIMEOUT,
        WORKER_PROTOCOL_ERROR
    }

    private final Reason reason;

    public DocumentConversionException(Reason reason) {
        this(reason, null);
    }

    public DocumentConversionException(Reason reason, Throwable cause) {
        super(reason.name(), cause);
        this.reason = reason;
    }

    public Reason reason() {
        return reason;
    }
}
