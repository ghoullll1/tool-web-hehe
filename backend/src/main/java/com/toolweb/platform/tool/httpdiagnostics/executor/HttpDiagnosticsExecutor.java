package com.toolweb.platform.tool.httpdiagnostics.executor;

import tools.jackson.databind.ObjectMapper;
import com.toolweb.platform.tool.execution.model.ToolExecutionContext;
import com.toolweb.platform.tool.execution.spi.TypedToolExecutor;
import com.toolweb.platform.tool.httpdiagnostics.service.HttpDiagnosticsService;
import jakarta.validation.Validator;
import org.springframework.stereotype.Component;

import static com.toolweb.platform.tool.httpdiagnostics.dto.HttpDiagnosticsModels.Request;
import static com.toolweb.platform.tool.httpdiagnostics.dto.HttpDiagnosticsModels.Result;

@Component
public class HttpDiagnosticsExecutor extends TypedToolExecutor<Request, Result> {

    public static final String KEY = "developer.http.diagnostics.v1";

    private final HttpDiagnosticsService service;

    public HttpDiagnosticsExecutor(ObjectMapper objectMapper, Validator validator, HttpDiagnosticsService service) {
        super(Request.class, objectMapper, validator);
        this.service = service;
    }

    @Override
    public String key() {
        return KEY;
    }

    @Override
    protected Result executeTyped(Request input, ToolExecutionContext context) {
        return service.inspect(input, context.requestId());
    }
}
