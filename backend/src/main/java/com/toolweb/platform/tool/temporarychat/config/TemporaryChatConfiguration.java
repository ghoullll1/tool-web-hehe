package com.toolweb.platform.tool.temporarychat.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration(proxyBeanMethods = false)
public class TemporaryChatConfiguration {

    @Bean("temporaryChatClock")
    Clock temporaryChatClock() {
        return Clock.systemUTC();
    }
}
