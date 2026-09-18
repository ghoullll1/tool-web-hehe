package com.toolweb.platform.tool.catalog.controller;

import com.toolweb.platform.tool.catalog.service.ToolCatalogService;
import com.toolweb.platform.tool.catalog.dto.ToolDescriptor;
import com.toolweb.platform.tool.execution.service.ToolExecutionService;
import com.toolweb.platform.web.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/tools")
@Validated
public class ToolCatalogController {

    static final String PUBLIC_CATALOG_CACHE_CONTROL =
            "public, max-age=60, s-maxage=60";
    private static final Logger log = LoggerFactory.getLogger(ToolCatalogController.class);

    private final ToolCatalogService catalogService;
    private final ToolExecutionService executionService;

    public ToolCatalogController(ToolCatalogService catalogService, ToolExecutionService executionService) {
        this.catalogService = catalogService;
        this.executionService = executionService;
    }

    @GetMapping
    ResponseEntity<List<ToolDescriptor>> listPublished() {
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, PUBLIC_CATALOG_CACHE_CONTROL)
                .body(catalogService.listPublished());
    }

    @PostMapping("/{slug}/usage")
    ResponseEntity<Void> incrementUsage(@PathVariable @Size(max = 100) String slug) {
        catalogService.incrementUsage(slug);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{slug}/execute")
    ResponseEntity<ToolExecutionResponse> execute(
            @PathVariable @Size(max = 100) String slug,
            @Valid @RequestBody ToolExecutionRequest body,
            HttpServletRequest request
    ) {
        log.info("Executing tool {}", slug);
        var output = executionService.execute(
                slug,
                body.input(),
                (String) request.getAttribute(RequestIdFilter.ATTRIBUTE_NAME),
                request.getLocale());
        return ResponseEntity.ok(new ToolExecutionResponse(output));
    }

    public record ToolExecutionRequest(@NotNull @Size(max = 100) Map<String, Object> input) {
    }

    public record ToolExecutionResponse(Map<String, Object> output) {
    }
}
