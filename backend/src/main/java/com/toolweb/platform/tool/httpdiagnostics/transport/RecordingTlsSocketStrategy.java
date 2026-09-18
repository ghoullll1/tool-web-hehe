package com.toolweb.platform.tool.httpdiagnostics.transport;

import org.apache.hc.client5.http.ssl.TlsSocketStrategy;
import org.apache.hc.core5.http.protocol.HttpContext;

import javax.naming.InvalidNameException;
import javax.naming.ldap.LdapName;
import javax.net.ssl.SSLSession;
import javax.net.ssl.SSLSocket;
import javax.security.auth.x500.X500Principal;
import java.io.IOException;
import java.net.Socket;
import java.net.URI;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Locale;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

import static com.toolweb.platform.tool.httpdiagnostics.dto.HttpDiagnosticsModels.TlsHandshake;

/** Captures TLS metadata from the exact socket used by one outbound diagnostic request. */
public final class RecordingTlsSocketStrategy implements TlsSocketStrategy {

    private static final int MAX_CERTIFICATE_TEXT_LENGTH = 1024;

    private final TlsSocketStrategy delegate;
    private final int sequence;
    private final URI requestUri;
    private TlsHandshake handshake;

    public RecordingTlsSocketStrategy(TlsSocketStrategy delegate, int sequence, URI requestUri) {
        this.delegate = delegate;
        this.sequence = sequence;
        this.requestUri = requestUri;
    }

    @Override
    public SSLSocket upgrade(
            Socket socket,
            String target,
            int port,
            Object attachment,
            HttpContext context
    ) throws IOException {
        var started = System.nanoTime();
        var upgraded = delegate.upgrade(socket, target, port, attachment, context);
        handshake = inspectSession(sequence, requestUri, elapsedMs(started), upgraded.getSession());
        return upgraded;
    }

    public Optional<TlsHandshake> handshake() {
        return Optional.ofNullable(handshake);
    }

    static TlsHandshake inspectSession(int sequence, URI requestUri, long handshakeMs, SSLSession session) {
        var now = Instant.now();
        var certificates = peerCertificates(session);
        var leaf = Arrays.stream(certificates)
                .filter(X509Certificate.class::isInstance)
                .map(X509Certificate.class::cast)
                .findFirst()
                .orElse(null);
        if (leaf == null) {
            return new TlsHandshake(sequence, requestUri.toASCIIString(), requestUri.getHost(), handshakeMs,
                    safeText(session.getProtocol()), safeText(session.getCipherSuite()), "未获取", "未获取",
                    "未获取", "未获取", null, null, 0, "未获取", "未获取", certificates.length);
        }

        var validFrom = leaf.getNotBefore().toInstant();
        var validUntil = leaf.getNotAfter().toInstant();
        var issuer = leaf.getIssuerX500Principal();
        var subject = leaf.getSubjectX500Principal();
        return new TlsHandshake(
                sequence,
                requestUri.toASCIIString(),
                requestUri.getHost(),
                handshakeMs,
                safeText(session.getProtocol()),
                safeText(session.getCipherSuite()),
                firstRdn(issuer, "O").or(() -> firstRdn(issuer, "CN")).orElse("未声明"),
                principalName(issuer),
                firstRdn(subject, "CN").orElse("未声明"),
                principalName(subject),
                validFrom,
                validUntil,
                Duration.between(now, validUntil).toDays(),
                safeText(leaf.getSerialNumber().toString(16).toUpperCase(Locale.ROOT)),
                safeText(leaf.getSigAlgName()),
                certificates.length);
    }

    private static Certificate[] peerCertificates(SSLSession session) {
        try {
            return session.getPeerCertificates();
        } catch (Exception ignored) {
            return new Certificate[0];
        }
    }

    private static Optional<String> firstRdn(X500Principal principal, String type) {
        try {
            return new LdapName(principal.getName(X500Principal.RFC2253)).getRdns().stream()
                    .filter(rdn -> rdn.getType().equalsIgnoreCase(type))
                    .map(rdn -> safeText(String.valueOf(rdn.getValue())))
                    .filter(value -> !value.isBlank())
                    .findFirst();
        } catch (InvalidNameException exception) {
            return Optional.empty();
        }
    }

    private static String principalName(X500Principal principal) {
        return safeText(principal.getName(X500Principal.RFC2253));
    }

    private static String safeText(String value) {
        if (value == null || value.isBlank()) {
            return "未获取";
        }
        var sanitized = value.codePoints()
                .map(codePoint -> Character.isISOControl(codePoint) || Character.getType(codePoint) == Character.FORMAT
                        ? ' '
                        : codePoint)
                .collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append)
                .toString()
                .strip();
        return sanitized.length() <= MAX_CERTIFICATE_TEXT_LENGTH
                ? sanitized
                : sanitized.substring(0, MAX_CERTIFICATE_TEXT_LENGTH) + "…";
    }

    private static long elapsedMs(long started) {
        return Math.max(0, Math.round(TimeUnit.NANOSECONDS.toMicros(System.nanoTime() - started) / 1000.0));
    }
}
