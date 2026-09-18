package com.toolweb.platform.tool.httpdiagnostics.policy;

import com.toolweb.platform.tool.execution.exception.ToolPolicyException;
import com.toolweb.platform.tool.httpdiagnostics.config.HttpDiagnosticsProperties;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OutboundTargetPolicyTest {

    private final OutboundTargetPolicy policy = new OutboundTargetPolicy(new HttpDiagnosticsProperties(
            Duration.ofSeconds(2), Duration.ofSeconds(5), 6, 128, 4096, 16, false, Set.of(), Set.of(80, 443)));

    @Test
    void acceptsAndNormalizesPublicHttpTargetsWithoutDoubleEncoding() {
        var target = policy.validate("HTTPS://8.8.8.8/search?q=hello%20world");

        assertThat(target.uri().toASCIIString()).isEqualTo("https://8.8.8.8/search?q=hello%20world");
        assertThat(target.addresses()).hasSize(1);
    }

    @Test
    void blocksLoopbackPrivateLinkLocalAndMetadataTargets() {
        assertBlocked("http://127.0.0.1/admin");
        assertBlocked("http://10.0.0.8/");
        assertBlocked("http://169.254.169.254/latest/meta-data/");
        assertBlocked("http://192.168.1.1/");
        assertBlocked("http://[::1]/");
    }

    @Test
    void rejectsEmbeddedCredentialsUnsupportedProtocolsAndUnapprovedPorts() {
        assertThatThrownBy(() -> policy.validate("file:///etc/passwd")).isInstanceOf(ToolPolicyException.class);
        assertThatThrownBy(() -> policy.validate("https://user:secret@8.8.8.8/"))
                .isInstanceOf(ToolPolicyException.class)
                .hasMessageContaining("高级设置中的凭证区域");
        assertThatThrownBy(() -> policy.validate("https://8.8.8.8:8443/")).isInstanceOf(ToolPolicyException.class);
    }

    @Test
    void removesBrowserFragmentsAndAllowsConfiguredPrivateHosts() {
        var trustedPolicy = new OutboundTargetPolicy(new HttpDiagnosticsProperties(
                Duration.ofSeconds(2), Duration.ofSeconds(5), 6, 128, 4096, 4, false,
                Set.of("localhost", "*.internal.example"), Set.of(80, 443)));

        var target = trustedPolicy.validate("http://localhost/#/login");

        assertThat(target.uri().toASCIIString()).isEqualTo("http://localhost/");
        assertThat(target.fragmentRemoved()).isTrue();
        assertThat(target.trustedPrivateTarget()).isTrue();
        assertThat(trustedPolicy.isTrustedPrivateHost("api.internal.example")).isTrue();
        assertThat(trustedPolicy.isTrustedPrivateHost("internal.example")).isFalse();
        assertThat(trustedPolicy.isTrustedPrivateHost("notinternal.example")).isFalse();
    }

    @Test
    void allowsLoopbackOnlyWhenDevelopmentOptInIsExplicit() {
        var developmentPolicy = new OutboundTargetPolicy(new HttpDiagnosticsProperties(
                Duration.ofSeconds(2), Duration.ofSeconds(5), 6, 128, 4096, 4, true, Set.of(), Set.of(80, 8090)));

        assertThat(developmentPolicy.validate("http://127.0.0.1:8090/api/v1/tools").uri().toASCIIString())
                .isEqualTo("http://127.0.0.1:8090/api/v1/tools");
    }

    private void assertBlocked(String url) {
        assertThatThrownBy(() -> policy.validate(url))
                .isInstanceOf(ToolPolicyException.class)
                .hasMessageContaining("阻止");
    }
}
