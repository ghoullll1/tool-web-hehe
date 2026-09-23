package com.toolweb.platform.tool.fileshare.controller;

import com.toolweb.platform.tool.fileshare.exception.FileShareAccessException;
import com.toolweb.platform.tool.fileshare.exception.FileShareStorageException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;

import java.net.URI;

@RestControllerAdvice(assignableTypes = TemporaryFileShareController.class)
public class TemporaryFileShareExceptionHandler {

    @ExceptionHandler(FileShareAccessException.class)
    ResponseEntity<ProblemDetail> handleAccess(FileShareAccessException exception, HttpServletRequest request) {
        // Do not disclose whether a guessed code ever existed.
        boolean limited = exception.reason() == FileShareAccessException.Reason.RATE_LIMITED;
        var body = limited
                ? problem(HttpStatus.TOO_MANY_REQUESTS, "尝试过于频繁", "请稍等一分钟后再输入取件码。", "PICKUP_RATE_LIMITED", request)
                : problem(HttpStatus.NOT_FOUND, "取件码不可用", "取件码不正确、已过期或已被使用。", "SHARE_INVALID", request);
        var response = ResponseEntity.status(body.getStatus()).header("Cache-Control", "no-store");
        if (limited) response.header("Retry-After", "60");
        return response.body(body);
    }

    @ExceptionHandler(FileShareStorageException.class)
    ProblemDetail handleStorage(FileShareStorageException exception, HttpServletRequest request) {
        return switch (exception.reason()) {
            case FILE_TOO_LARGE -> problem(HttpStatus.PAYLOAD_TOO_LARGE, "文件不可上传", "请选择非空且不超过 30 MB 的文件。", "FILE_INVALID", request);
            case CAPACITY_EXCEEDED -> problem(HttpStatus.TOO_MANY_REQUESTS, "临时存储繁忙", "当前临时分享较多，请稍后重试。", "STORAGE_BUSY", request);
            case OBJECT_MISSING, IO_FAILURE -> problem(HttpStatus.INTERNAL_SERVER_ERROR, "文件存储异常", "暂时无法处理该文件，请稍后重试。", "STORAGE_FAILURE", request);
        };
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ProblemDetail handleMaxUpload(MaxUploadSizeExceededException exception, HttpServletRequest request) {
        return problem(HttpStatus.PAYLOAD_TOO_LARGE, "文件过大", "单个文件不能超过 30 MB。", "FILE_TOO_LARGE", request);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ProblemDetail handleInvalidRequest(HttpMessageNotReadableException exception, HttpServletRequest request) {
        return problem(HttpStatus.BAD_REQUEST, "取件码无效", "请输入 8 位数字取件码。", "PICKUP_CODE_REQUIRED", request);
    }

    @ExceptionHandler(MultipartException.class)
    ProblemDetail handleMultipart(MultipartException exception, HttpServletRequest request) {
        return problem(HttpStatus.BAD_REQUEST, "上传内容无效", "无法读取上传文件，请重新选择后再试。", "UPLOAD_INVALID", request);
    }

    private ProblemDetail problem(
            HttpStatus status,
            String title,
            String detail,
            String code,
            HttpServletRequest request
    ) {
        var problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(title);
        problem.setInstance(URI.create(request.getRequestURI()));
        problem.setProperty("code", code);
        return problem;
    }
}
