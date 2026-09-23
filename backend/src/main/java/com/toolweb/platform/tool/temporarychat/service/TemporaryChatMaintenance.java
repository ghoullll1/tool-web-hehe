package com.toolweb.platform.tool.temporarychat.service;

import com.toolweb.platform.tool.temporarychat.websocket.TemporaryChatWebSocketHandler;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class TemporaryChatMaintenance {

    private final TemporaryChatWebSocketHandler webSocketHandler;
    private final TemporaryChatRealtimeService realtime;

    public TemporaryChatMaintenance(
            TemporaryChatWebSocketHandler webSocketHandler,
            TemporaryChatRealtimeService realtime
    ) {
        this.webSocketHandler = webSocketHandler;
        this.realtime = realtime;
    }

    @Scheduled(fixedDelayString = "${tool-platform.temporary-chat.cleanup-interval:5s}")
    void maintain() {
        webSocketHandler.closeExpiredUnauthenticatedConnections();
        realtime.sweep();
    }
}
