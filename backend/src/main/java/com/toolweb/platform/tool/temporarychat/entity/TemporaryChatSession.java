package com.toolweb.platform.tool.temporarychat.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;

import java.time.Instant;

@TableName("temporary_chat_session")
public class TemporaryChatSession {

    public enum Status { WAITING, ACTIVE, EXPIRED, CLOSED }

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;
    private String sessionId;
    private String sessionKeyDigest;
    private String creatorClientId;
    private String creatorDisplayName;
    private String participantClientId;
    private String participantDisplayName;
    private Status status;
    private Instant createdAt;
    private Instant joinDeadlineAt;
    private Instant creatorConnectedAt;
    private Instant participantConnectedAt;
    private Instant connectedAt;
    private Instant creatorLastMessageAt;
    private Instant participantLastMessageAt;
    private Instant closedAt;
    private String closeReason;
    @Version
    private long version;

    protected TemporaryChatSession() {
    }

    public static TemporaryChatSession waiting(
            String sessionId,
            String sessionKeyDigest,
            String creatorClientId,
            String creatorDisplayName,
            Instant createdAt,
            Instant joinDeadlineAt
    ) {
        var session = new TemporaryChatSession();
        session.sessionId = sessionId;
        session.sessionKeyDigest = sessionKeyDigest;
        session.creatorClientId = creatorClientId;
        session.creatorDisplayName = creatorDisplayName;
        session.status = Status.WAITING;
        session.createdAt = createdAt;
        session.joinDeadlineAt = joinDeadlineAt;
        return session;
    }

    public Long id() { return id; }
    public String sessionId() { return sessionId; }
    public String sessionKeyDigest() { return sessionKeyDigest; }
    public String creatorClientId() { return creatorClientId; }
    public String creatorDisplayName() { return creatorDisplayName; }
    public String participantClientId() { return participantClientId; }
    public String participantDisplayName() { return participantDisplayName; }
    public Status status() { return status; }
    public Instant createdAt() { return createdAt; }
    public Instant joinDeadlineAt() { return joinDeadlineAt; }
    public Instant creatorConnectedAt() { return creatorConnectedAt; }
    public Instant participantConnectedAt() { return participantConnectedAt; }
    public Instant connectedAt() { return connectedAt; }
    public Instant creatorLastMessageAt() { return creatorLastMessageAt; }
    public Instant participantLastMessageAt() { return participantLastMessageAt; }
    public Instant closedAt() { return closedAt; }
    public String closeReason() { return closeReason; }
    public long version() { return version; }
}
