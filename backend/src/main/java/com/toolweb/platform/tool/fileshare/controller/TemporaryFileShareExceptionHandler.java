package com.toolweb.platform.tool.fileshare.controller;

import com.toolweb.platform.tool.fileshare.exception.FileShareAccessException;
import com.toolweb.platform.tool.fileshare.exception.FileShareStorageException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;

import java.net.URI;

@RestControllerAdvice(assignableTypes = TemporaryFileShareController.class)
public class TemporaryFileShareExceptionHandler {

    @ExceptionHandler(FileShareAccessException.class)
    ProblemDetail handleAccess(FileShareAccessException exception, HttpServletRequest request) {
        return switch (exception.reason()) {
            case INVALID -> problem(HttpStatus.NOT_FOUND, "分享不可用", "分享不存在或密钥不正确。", "SHARE_INVALID", request);
            case EXPIRED -> problem(HttpStatus.GONE, "分享已过期", "该文件分享已超过五分钟有效期。", "SHARE_EXPIRED", request);
            case CONSUMED -> problem(HttpStatus.GONE, "下载次数已用完", "该文件分享仅允许下载一次。", "SHARE_CONSUMED", request);
        };
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

    @ExceptionHandler(MissingRequestHeaderException.class)
    ProblemDetail handleMissingHeader(MissingRequestHeaderException exception, HttpServletRequest request) {
        return problem(HttpStatus.BAD_REQUEST, "缺少分享密钥", "请输入分享密钥后再下载。", "SHARE_KEY_REQUIRED", request);
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
