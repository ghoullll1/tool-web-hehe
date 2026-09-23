package com.toolweb.platform.tool.fileshare.service;

import com.toolweb.platform.tool.fileshare.exception.FileShareAccessException;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class PickupCodesTest {
    private final PickupCodes codes = new PickupCodes("test-only-secret-at-least-thirty-two-bytes");

    @Test void requiresARealDeploymentSecret() {
        assertThatThrownBy(() -> new PickupCodes("")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new PickupCodes("replace-with-a-long-real-secret-value")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test void generatesEightDigitsAndUsesASecretBoundDigest() {
        for (int i = 0; i < 100; i++) assertThat(codes.generate()).matches("[0-9]{8}");
        assertThat(codes.digest("01234567")).matches("[a-f0-9]{64}").isEqualTo(codes.digest("01234567"));
        assertThat(codes.digest("01234567")).isNotEqualTo(new PickupCodes("another-secret-at-least-thirty-two-bytes").digest("01234567"));
        for (String invalid : new String[]{"1234567", "123456789", "abcdefgh", " 01234567", "０１２３４５６７"}) {
            assertThatThrownBy(() -> codes.digest(invalid)).isInstanceOf(FileShareAccessException.class);
        }
        assertThatThrownBy(() -> codes.digest(null)).isInstanceOf(FileShareAccessException.class);
    }
}
