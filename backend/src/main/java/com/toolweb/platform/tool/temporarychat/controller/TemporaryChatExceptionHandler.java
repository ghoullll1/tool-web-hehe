package com.toolweb.platform.tool.temporarychat.controller;

import com.toolweb.platform.tool.temporarychat.exception.TemporaryChatException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.net.URI;

@RestControllerAdvice(assignableTypes = TemporaryChatController.class)
public class TemporaryChatExceptionHandler {

    @ExceptionHandler(TemporaryChatException.class)
    ProblemDetail handleTemporaryChat(TemporaryChatException exception, HttpServletRequest request) {
        return switch (exception.reason()) {
            case SESSION_UNAVAILABLE -> problem(
                    HttpStatus.CONFLICT,
                    "会话不可加入",
                    "会话密钥无效、已过期，或已有两位用户连接。",
                    "SESSION_UNAVAILABLE",
                    request
            );
            case CAPACITY_EXCEEDED -> problem(
                    HttpStatus.TOO_MANY_REQUESTS,
                    "临时会话繁忙",
                    "当前临时会话数量已达上限，请稍后重试。",
                    "CHAT_CAPACITY_EXCEEDED",
                    request
            );
            case INVALID_REQUEST -> problem(
                    HttpStatus.BAD_REQUEST,
                    "会话请求无效",
                    "请检查会话信息后重试。",
                    "CHAT_REQUEST_INVALID",
                    request
            );
        };
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
