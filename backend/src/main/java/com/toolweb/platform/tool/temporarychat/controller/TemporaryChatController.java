package com.toolweb.platform.tool.temporarychat.controller;

import com.toolweb.platform.tool.temporarychat.dto.TemporaryChatModels;
import com.toolweb.platform.tool.temporarychat.service.TemporaryChatService;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/temporary-chat/sessions")
public class TemporaryChatController {

    private final TemporaryChatService service;

    public TemporaryChatController(TemporaryChatService service) {
        this.service = service;
    }

    @PostMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<TemporaryChatModels.CreatedSession> create(
            @Valid @RequestBody(required = false) TemporaryChatModels.CreateRequest request
    ) {
        return ResponseEntity.status(201)
                .cacheControl(CacheControl.noStore())
                .body(service.create(request));
    }

    @PostMapping(path = "/join", produces = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<TemporaryChatModels.JoinedSession> join(
            @Valid @RequestBody TemporaryChatModels.JoinRequest request
    ) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.join(request));
    }
}
