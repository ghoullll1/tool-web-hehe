package com.toolweb.platform.tool.temporarychat.config;

import com.toolweb.platform.config.PlatformProperties;
import com.toolweb.platform.tool.temporarychat.websocket.TemporaryChatWebSocketHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.standard.ServletServerContainerFactoryBean;

@Configuration(proxyBeanMethods = false)
@EnableWebSocket
public class TemporaryChatWebSocketConfig implements WebSocketConfigurer {

    private final TemporaryChatWebSocketHandler handler;
    private final PlatformProperties platformProperties;

    public TemporaryChatWebSocketConfig(
            TemporaryChatWebSocketHandler handler,
            PlatformProperties platformProperties
    ) {
        this.handler = handler;
        this.platformProperties = platformProperties;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws/v1/temporary-chat")
                .setAllowedOrigins(platformProperties.cors().allowedOrigins().toArray(String[]::new));
    }

    @Bean
    ServletServerContainerFactoryBean temporaryChatWebSocketContainer(TemporaryChatProperties properties) {
        var container = new ServletServerContainerFactoryBean();
        container.setMaxTextMessageBufferSize(properties.maxFrameBytes());
        container.setMaxBinaryMessageBufferSize(1_024);
        return container;
    }
}
