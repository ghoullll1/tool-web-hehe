package com.toolweb.platform.tool.fileshare.service;

import com.toolweb.platform.tool.fileshare.exception.FileShareAccessException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.Locale;

@Component
public class PickupCodes {
    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();

    public PickupCodes(@Value("${tool-platform.temporary-file-share.pickup-code-secret:}") String secret) {
        if (secret == null || secret.getBytes(StandardCharsets.UTF_8).length < 32 || secret.startsWith("replace-")) {
            throw new IllegalArgumentException("TEMPORARY_FILE_SHARE_PICKUP_CODE_SECRET must contain at least 32 random characters");
        }
        key = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
    }

    public String generate() {
        return String.format(Locale.ROOT, "%08d", random.nextInt(100_000_000));
    }

    public String digest(String code) {
        if (code == null || !code.matches("[0-9]{8}")) {
            throw new FileShareAccessException(FileShareAccessException.Reason.INVALID);
        }
        try {
            var mac = Mac.getInstance("HmacSHA256");
            mac.init(key);
            return HexFormat.of().formatHex(mac.doFinal(code.getBytes(StandardCharsets.US_ASCII)));
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("HmacSHA256 unavailable", exception);
        }
    }
}
