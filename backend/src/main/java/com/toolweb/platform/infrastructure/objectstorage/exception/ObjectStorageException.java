package com.toolweb.platform.infrastructure.objectstorage.exception;

public class ObjectStorageException extends RuntimeException {

    public enum Reason {
        INVALID_KEY,
        NOT_FOUND,
        ACCESS_DENIED,
        UNAVAILABLE,
        IO_FAILURE
    }

    private final Reason reason;

    public ObjectStorageException(Reason reason) {
        this(reason, null);
    }

    public ObjectStorageException(Reason reason, Throwable cause) {
        super(reason.name(), cause);
        this.reason = reason;
    }

    public Reason reason() {
        return reason;
    }
}
