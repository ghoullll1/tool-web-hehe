package com.toolweb.platform.tool.catalog.controller;

import com.toolweb.platform.tool.catalog.dto.ToolAdminDescriptor;
import com.toolweb.platform.tool.catalog.service.ToolCatalogService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/admin/tools")
public class ToolAdminController {

    private final ToolCatalogService catalogService;

    public ToolAdminController(ToolCatalogService catalogService) {
        this.catalogService = catalogService;
    }

    @GetMapping
    List<ToolAdminDescriptor> listAll() {
        return catalogService.listAll();
    }

    @PatchMapping("/{slug}/availability")
    ToolAdminDescriptor updateAvailability(
            @PathVariable String slug,
            @Valid @RequestBody AvailabilityRequest body
    ) {
        return catalogService.setAvailability(slug, body.enabled());
    }

    public record AvailabilityRequest(@NotNull Boolean enabled) {
    }
}

