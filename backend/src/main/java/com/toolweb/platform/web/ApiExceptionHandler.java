package com.toolweb.platform.web;

import com.toolweb.platform.tool.catalog.exception.ToolNotExecutableException;
import com.toolweb.platform.tool.catalog.exception.ToolNotFoundException;
import com.toolweb.platform.tool.execution.exception.ToolInputException;
import com.toolweb.platform.tool.execution.exception.ToolCapacityException;
import com.toolweb.platform.tool.execution.exception.ToolPolicyException;
import com.toolweb.platform.tool.execution.exception.ToolUpstreamException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.net.URI;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(ToolNotFoundException.class)
    ProblemDetail handleNotFound(ToolNotFoundException exception, HttpServletRequest request) {
        return problem(HttpStatus.NOT_FOUND, "Tool not found", exception.getMessage(), request);
    }

    @ExceptionHandler(ToolNotExecutableException.class)
    ProblemDetail handleNotExecutable(ToolNotExecutableException exception, HttpServletRequest request) {
        return problem(HttpStatus.UNPROCESSABLE_CONTENT, "Tool is not executable", exception.getMessage(), request);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail handleValidation(MethodArgumentNotValidException exception, HttpServletRequest request) {
        var detail = problem(HttpStatus.BAD_REQUEST, "Validation failed", "Request validation failed", request);
        detail.setProperty("errors", exception.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getField() + ": " + error.getDefaultMessage())
                .toList());
        return detail;
    }

    @ExceptionHandler(ToolInputException.class)
    ProblemDetail handleToolInput(ToolInputException exception, HttpServletRequest request) {
        var detail = problem(HttpStatus.BAD_REQUEST, "Invalid tool input", exception.getMessage(), request);
        detail.setProperty("code", "TOOL_INPUT_INVALID");
        detail.setProperty("errors", exception.errors());
        return detail;
    }

    @ExceptionHandler(ToolPolicyException.class)
    ProblemDetail handleToolPolicy(ToolPolicyException exception, HttpServletRequest request) {
        var detail = problem(HttpStatus.UNPROCESSABLE_CONTENT, "Target blocked by policy", exception.getMessage(), request);
        detail.setProperty("code", "TARGET_BLOCKED");
        return detail;
    }

    @ExceptionHandler(ToolUpstreamException.class)
    ProblemDetail handleToolUpstream(ToolUpstreamException exception, HttpServletRequest request) {
        var status = exception.timeout() ? HttpStatus.GATEWAY_TIMEOUT : HttpStatus.BAD_GATEWAY;
        var detail = problem(status, "Upstream request failed", exception.getMessage(), request);
        detail.setProperty("code", exception.timeout() ? "UPSTREAM_TIMEOUT" : "UPSTREAM_FAILURE");
        return detail;
    }

    @ExceptionHandler(ToolCapacityException.class)
    ProblemDetail handleToolCapacity(ToolCapacityException exception, HttpServletRequest request) {
        var detail = problem(HttpStatus.TOO_MANY_REQUESTS, "Tool capacity exceeded", exception.getMessage(), request);
        detail.setProperty("code", "TOOL_BUSY");
        return detail;
    }

    private ProblemDetail problem(
            HttpStatus status,
            String title,
            String detail,
            HttpServletRequest request
    ) {
        var problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(title);
        problem.setInstance(URI.create(request.getRequestURI()));
        return problem;
    }
}
