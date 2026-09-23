package com.toolweb.platform.tool.temporarychat.service;

import com.toolweb.platform.tool.temporarychat.exception.TemporaryChatException;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;

@Component
public class TemporaryChatTokenService {

    private static final char[] KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
    private static final SecureRandom RANDOM = new SecureRandom();

    public String newSessionKey() {
        var value = new StringBuilder(14);
        for (int index = 0; index < 12; index++) {
            if (index > 0 && index % 4 == 0) value.append('-');
            value.append(KEY_ALPHABET[RANDOM.nextInt(KEY_ALPHABET.length)]);
        }
        return value.toString();
    }

    public String normalizeSessionKey(String value) {
        if (value == null) throw invalidKey();
        var normalized = value.strip().toUpperCase(Locale.ROOT).replace(" ", "");
        if (!normalized.matches("[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}")) {
            throw invalidKey();
        }
        return normalized;
    }

    public String newTicket() {
        var bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public String digest(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private TemporaryChatException invalidKey() {
        return new TemporaryChatException(
                TemporaryChatException.Reason.SESSION_UNAVAILABLE,
                "Temporary chat session is unavailable"
        );
    }
}
