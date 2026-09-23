package com.toolweb.platform.tool.fileshare.service;

import com.toolweb.platform.tool.fileshare.exception.FileShareAccessException;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.util.HashMap;
import java.util.Map;

/** Single-backend deployment: bound both per-peer guesses and total guesses across peers. */
@Component
public class PickupAttemptLimiter {
    private static final long WINDOW_MS = 60_000;
    private static final int MAX_PEERS = 2048;
    private final Clock clock;
    private final Map<String, Window> peers = new HashMap<>();
    private Window global;

    public PickupAttemptLimiter() { this(Clock.systemUTC()); }
    PickupAttemptLimiter(Clock clock) { this.clock = clock; }

    public synchronized void check(String peer) {
        long now = clock.millis();
        peers.entrySet().removeIf(entry -> now - entry.getValue().start >= WINDOW_MS);
        if (global == null || now - global.start >= WINDOW_MS) global = new Window(now);
        var window = peers.get(peer);
        if (global.count >= 60 || (window != null && window.count >= 5)
                || (window == null && peers.size() >= MAX_PEERS)) {
            throw new FileShareAccessException(FileShareAccessException.Reason.RATE_LIMITED);
        }
        if (window == null) {
            window = new Window(now);
            peers.put(peer, window);
        }
        window.count++;
        global.count++;
    }

    private static final class Window {
        private final long start;
        private int count;
        private Window(long start) { this.start = start; }
    }
}
