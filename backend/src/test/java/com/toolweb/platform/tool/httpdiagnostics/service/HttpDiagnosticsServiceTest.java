package com.toolweb.platform.tool.httpdiagnostics.service;

import com.sun.net.httpserver.HttpServer;
import com.toolweb.platform.tool.execution.exception.ToolInputException;
import com.toolweb.platform.tool.httpdiagnostics.config.HttpDiagnosticsProperties;
import com.toolweb.platform.tool.httpdiagnostics.policy.OutboundTargetPolicy;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;

import static com.toolweb.platform.tool.httpdiagnostics.dto.HttpDiagnosticsModels.Authentication;
import static com.toolweb.platform.tool.httpdiagnostics.dto.HttpDiagnosticsModels.Request;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class HttpDiagnosticsServiceTest {

    private HttpServer origin;
    private HttpServer destination;
    private HttpDiagnosticsService service;
    private final AtomicReference<String> originAuthorization = new AtomicReference<>();
    private final AtomicReference<String> destinationAuthorization = new AtomicReference<>();

    @BeforeEach
    void startServers() throws IOException {
        origin = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        destination = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        origin.createContext("/basic", exchange -> {
            originAuthorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            exchange.getResponseHeaders().add("Content-Type", "text/html; charset=UTF-8");
            exchange.getResponseHeaders().add("Strict-Transport-Security", "max-age=31536000");
            exchange.getResponseHeaders().add("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none'");
            exchange.getResponseHeaders().add("X-Content-Type-Options", "nosniff");
            exchange.getResponseHeaders().add("Access-Control-Allow-Origin", "https://app.example");
            exchange.getResponseHeaders().add("Set-Cookie", "session=value; HttpOnly; SameSite=Lax");
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
        });
        origin.createContext("/redirect", exchange -> {
            originAuthorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            exchange.getResponseHeaders().add("Location", destinationUrl("/final"));
            exchange.sendResponseHeaders(302, -1);
            exchange.close();
        });
        destination.createContext("/final", exchange -> {
            destinationAuthorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
        });
        origin.start();
        destination.start();

        var properties = new HttpDiagnosticsProperties(
                Duration.ofSeconds(2), Duration.ofSeconds(5), 6, 128, 4096, 4, true,
                Set.of(), Set.of(origin.getAddress().getPort(), destination.getAddress().getPort()));
        service = new HttpDiagnosticsService(properties, new OutboundTargetPolicy(properties));
    }

    @AfterEach
    void stopServers() {
        origin.stop(0);
        destination.stop(0);
    }

    @Test
    void forwardsBasicCredentialsOnlyToTheConfiguredOriginAndReturnsProfessionalAnalysis() {
        var result = service.inspect(request(originUrl("/basic"), new Authentication("BASIC", "alice", "secret", null)), "request-basic");

        var expected = "Basic " + Base64.getEncoder().encodeToString("alice:secret".getBytes(StandardCharsets.UTF_8));
        assertThat(originAuthorization).hasValue(expected);
        assertThat(result.authentication().configured()).isTrue();
        assertThat(result.authentication().sentToFinalOrigin()).isTrue();
        assertThat(result.authentication().summary()).doesNotContain("secret");
        assertThat(result.security().controls()).isNotEmpty();
        assertThat(result.security().heuristic()).isTrue();
        assertThat(result.cors().allowOrigin()).isEqualTo("https://app.example");
        assertThat(result.response().charset()).isEqualTo("UTF-8");
        assertThat(result.tls().used()).isFalse();
        assertThat(result.tls().handshakes()).isEmpty();
        assertThat(result.findings()).anyMatch(finding -> finding.title().equals("未使用 TLS"));
    }

    @Test
    void stripsBearerCredentialsWhenRedirectChangesOrigin() {
        var result = service.inspect(request(originUrl("/redirect"), new Authentication("BEARER", null, "token-value", null)), "request-redirect");

        assertThat(originAuthorization).hasValue("Bearer token-value");
        assertThat(destinationAuthorization).hasValue(null);
        assertThat(result.authentication().strippedOnRedirect()).isTrue();
        assertThat(result.authentication().sentToFinalOrigin()).isFalse();
        assertThat(result.findings()).anyMatch(finding -> finding.title().equals("凭证转发边界"));
    }

    @Test
    void rejectsSensitiveOrTransportHeadersAsApiKeyNames() {
        assertThatThrownBy(() -> service.inspect(
                request(originUrl("/basic"), new Authentication("API_KEY", null, "value", "Cookie")), "request-api-key"))
                .isInstanceOf(ToolInputException.class)
                .hasMessageContaining("不能用于 API Key");
    }

    @Test
    void rejectsCleartextCredentialsOutsideTheExplicitPrivateDevelopmentMode() {
        var productionProperties = new HttpDiagnosticsProperties(
                Duration.ofSeconds(2), Duration.ofSeconds(5), 6, 128, 4096, 4, false, Set.of(), Set.of(80, 443));
        var productionService = new HttpDiagnosticsService(productionProperties, new OutboundTargetPolicy(productionProperties));

        assertThatThrownBy(() -> productionService.inspect(
                request("http://8.8.8.8/", new Authentication("BEARER", null, "token", null)), "request-cleartext"))
                .isInstanceOf(ToolInputException.class)
                .hasMessageContaining("仅支持 HTTPS");
    }

    @Test
    void preservesCredentialBytesButRejectsBasicUsernameSeparators() {
        assertThatThrownBy(() -> service.inspect(
                request(originUrl("/basic"), new Authentication("BASIC", "ali:ce", " secret ", null)), "request-basic-colon"))
                .isInstanceOf(ToolInputException.class)
                .hasMessageContaining("不能包含冒号");

        service.inspect(request(originUrl("/basic"), new Authentication("BASIC", "alice", " secret ", null)), "request-basic-space");
        var expected = "Basic " + Base64.getEncoder().encodeToString("alice: secret ".getBytes(StandardCharsets.UTF_8));
        assertThat(originAuthorization).hasValue(expected);
    }

    @Test
    void normalizesBrowserFragmentsAndReportsWhyTheyWereIgnored() {
        var result = service.inspect(request(originUrl("/basic") + "#/login", null), "request-fragment");

        assertThat(result.requestedUrl()).isEqualTo(originUrl("/basic"));
        assertThat(result.finalUrl()).isEqualTo(originUrl("/basic"));
        assertThat(result.findings()).anyMatch(finding -> finding.title().equals("已忽略 URL 片段"));
    }

    private Request request(String url, Authentication authentication) {
        return new Request(url, "GET", true, 6, 5000, null, null, authentication);
    }

    private String originUrl(String path) {
        return "http://127.0.0.1:" + origin.getAddress().getPort() + path;
    }

    private String destinationUrl(String path) {
        return "http://127.0.0.1:" + destination.getAddress().getPort() + path;
    }
}
