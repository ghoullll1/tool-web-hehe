package com.toolweb.platform.tool.httpdiagnostics.transport;

import org.junit.jupiter.api.Test;

import javax.net.ssl.SSLSession;
import javax.security.auth.x500.X500Principal;
import java.net.URI;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RecordingTlsSocketStrategyTest {

    @Test
    void extractsIssuerNegotiationAndValidityFromTheValidatedSession() throws Exception {
        var session = mock(SSLSession.class);
        var certificate = mock(X509Certificate.class);
        var now = Instant.now();
        when(session.getProtocol()).thenReturn("TLSv1.3");
        when(session.getCipherSuite()).thenReturn("TLS_AES_256_GCM_SHA384");
        when(session.getPeerCertificates()).thenReturn(new Certificate[]{certificate});
        when(certificate.getIssuerX500Principal()).thenReturn(new X500Principal("CN=R13,O=Let's Encrypt,C=US"));
        when(certificate.getSubjectX500Principal()).thenReturn(new X500Principal("CN=tool.example.com,O=Example Ltd,C=CN"));
        when(certificate.getNotBefore()).thenReturn(Date.from(now.minus(10, ChronoUnit.DAYS)));
        when(certificate.getNotAfter()).thenReturn(Date.from(now.plus(80, ChronoUnit.DAYS)));
        when(certificate.getSerialNumber()).thenReturn(new java.math.BigInteger("abcdef", 16));
        when(certificate.getSigAlgName()).thenReturn("SHA256withRSA");

        var result = RecordingTlsSocketStrategy.inspectSession(
                2, URI.create("https://tool.example.com/path"), 37, session);

        assertThat(result.sequence()).isEqualTo(2);
        assertThat(result.host()).isEqualTo("tool.example.com");
        assertThat(result.handshakeMs()).isEqualTo(37);
        assertThat(result.protocol()).isEqualTo("TLSv1.3");
        assertThat(result.cipherSuite()).isEqualTo("TLS_AES_256_GCM_SHA384");
        assertThat(result.issuerOrganization()).isEqualTo("Let's Encrypt");
        assertThat(result.issuerDistinguishedName()).contains("O=Let's Encrypt");
        assertThat(result.subjectCommonName()).isEqualTo("tool.example.com");
        assertThat(result.daysRemaining()).isBetween(79L, 80L);
        assertThat(result.serialNumber()).isEqualTo("ABCDEF");
        assertThat(result.signatureAlgorithm()).isEqualTo("SHA256withRSA");
        assertThat(result.certificateChainLength()).isEqualTo(1);
    }
}
