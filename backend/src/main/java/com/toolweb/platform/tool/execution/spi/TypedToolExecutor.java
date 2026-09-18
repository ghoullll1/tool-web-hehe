package com.toolweb.platform.tool.execution.spi;

import com.toolweb.platform.tool.execution.exception.ToolInputException;
import com.toolweb.platform.tool.execution.model.ToolExecutionContext;
import tools.jackson.databind.ObjectMapper;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Type-safe adapter for backend tools while preserving the catalog's stable map-based SPI.
 * New server tools only need to declare their request type and implement {@link #executeTyped}.
 */
public abstract class TypedToolExecutor<I, O> implements ToolExecutor {

    private final Class<I> inputType;
    private final ObjectMapper objectMapper;
    private final Validator validator;

    protected TypedToolExecutor(Class<I> inputType, ObjectMapper objectMapper, Validator validator) {
        this.inputType = inputType;
        this.objectMapper = objectMapper;
        this.validator = validator;
    }

    @Override
    public final Map<String, Object> execute(Map<String, Object> input, ToolExecutionContext context) {
        final I typedInput;
        try {
            typedInput = objectMapper.convertValue(input, inputType);
        } catch (IllegalArgumentException exception) {
            throw new ToolInputException("请求参数格式不正确", exception);
        }

        var errors = validator.validate(typedInput).stream()
                .map(this::formatViolation)
                .sorted()
                .toList();
        if (!errors.isEmpty()) {
            throw new ToolInputException("请求参数校验失败", errors);
        }

        @SuppressWarnings("unchecked")
        var output = objectMapper.convertValue(executeTyped(typedInput, context), LinkedHashMap.class);
        return output;
    }

    protected abstract O executeTyped(I input, ToolExecutionContext context);

    private String formatViolation(ConstraintViolation<I> violation) {
        return violation.getPropertyPath() + ": " + violation.getMessage();
    }
}
