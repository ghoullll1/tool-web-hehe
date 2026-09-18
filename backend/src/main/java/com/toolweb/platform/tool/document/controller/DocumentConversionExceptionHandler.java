package com.toolweb.platform.tool.document.controller;

import com.toolweb.platform.tool.document.exception.DocumentConversionException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;

import java.net.URI;

@RestControllerAdvice(assignableTypes = DocumentConversionController.class)
public class DocumentConversionExceptionHandler {

    @ExceptionHandler(DocumentConversionException.class)
    ProblemDetail handleConversion(DocumentConversionException exception, HttpServletRequest request) {
        return switch (exception.reason()) {
            case EMPTY_FILE -> problem(HttpStatus.BAD_REQUEST, "文档为空", "请选择包含内容的文档。", "DOCUMENT_EMPTY", request);
            case FILE_TOO_LARGE -> problem(HttpStatus.PAYLOAD_TOO_LARGE, "文档过大", "单个文档不能超过 10 MB。", "DOCUMENT_TOO_LARGE", request);
            case UNSUPPORTED_EXTENSION -> problem(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "暂不支持该格式", "请选择受支持的文档格式后重试。", "DOCUMENT_TYPE_UNSUPPORTED", request);
            case INVALID_FILENAME -> problem(HttpStatus.BAD_REQUEST, "文件名无效", "无法识别该文档的文件名。", "DOCUMENT_FILENAME_INVALID", request);
            case CAPACITY_EXCEEDED -> problem(HttpStatus.TOO_MANY_REQUESTS, "转换服务繁忙", "当前转换任务较多，请稍后重试。", "CONVERSION_BUSY", request);
            case CONVERSION_FAILED -> problem(HttpStatus.UNPROCESSABLE_CONTENT, "文档无法转换", "转换引擎无法读取该文档，请确认文件未损坏。", "CONVERSION_FAILED", request);
            case OUTPUT_TOO_LARGE -> problem(HttpStatus.PAYLOAD_TOO_LARGE, "转换结果过大", "该文档生成的 Markdown 超出服务限制。", "CONVERSION_OUTPUT_TOO_LARGE", request);
            case WORKER_TIMEOUT -> problem(HttpStatus.GATEWAY_TIMEOUT, "转换超时", "文档转换超过处理时限，请稍后重试。", "CONVERSION_TIMEOUT", request);
            case WORKER_UNAVAILABLE -> problem(HttpStatus.SERVICE_UNAVAILABLE, "转换服务暂不可用", "文档转换服务尚未就绪或正忙，请稍后重试。", "CONVERSION_UNAVAILABLE", request);
            case WORKER_PROTOCOL_ERROR -> problem(HttpStatus.BAD_GATEWAY, "转换响应异常", "文档转换服务返回了无法识别的结果。", "CONVERSION_UPSTREAM_INVALID", request);
        };
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ProblemDetail handleMaxUpload(MaxUploadSizeExceededException exception, HttpServletRequest request) {
        return problem(HttpStatus.PAYLOAD_TOO_LARGE, "文档过大", "单个文档不能超过 10 MB。", "DOCUMENT_TOO_LARGE", request);
    }

    @ExceptionHandler(MultipartException.class)
    ProblemDetail handleMultipart(MultipartException exception, HttpServletRequest request) {
        return problem(HttpStatus.BAD_REQUEST, "上传内容无效", "无法读取上传文档，请重新选择后再试。", "DOCUMENT_UPLOAD_INVALID", request);
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
