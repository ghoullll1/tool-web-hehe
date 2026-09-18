package com.toolweb.platform.tool.fileshare.exception;

public class FileShareStorageException extends RuntimeException {

    public enum Reason {
        FILE_TOO_LARGE,
        CAPACITY_EXCEEDED,
        OBJECT_MISSING,
        IO_FAILURE
    }

    private final Reason reason;

    public FileShareStorageException(Reason reason) {
        this(reason, null);
    }

    public FileShareStorageException(Reason reason, Throwable cause) {
        super(reason.name(), cause);
        this.reason = reason;
    }

    public Reason reason() {
        return reason;
    }
}
