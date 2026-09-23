package com.toolweb.platform.tool.temporarychat.dao;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.toolweb.platform.tool.temporarychat.entity.TemporaryChatSession;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.Instant;
import java.util.Optional;

@Mapper
public interface TemporaryChatSessionMapper extends BaseMapper<TemporaryChatSession> {

    Optional<TemporaryChatSession> selectByKeyDigestForUpdate(@Param("sessionKeyDigest") String sessionKeyDigest);

    int reserveParticipant(
            @Param("sessionId") String sessionId,
            @Param("participantClientId") String participantClientId,
            @Param("participantDisplayName") String participantDisplayName,
            @Param("now") Instant now
    );

    int markActive(
            @Param("sessionId") String sessionId,
            @Param("creatorConnectedAt") Instant creatorConnectedAt,
            @Param("participantConnectedAt") Instant participantConnectedAt,
            @Param("connectedAt") Instant connectedAt
    );

    int touchMessage(
            @Param("sessionId") String sessionId,
            @Param("role") String role,
            @Param("messageAt") Instant messageAt
    );

    int closeSession(
            @Param("sessionId") String sessionId,
            @Param("status") String status,
            @Param("closedAt") Instant closedAt,
            @Param("closeReason") String closeReason
    );

    int closeAllNonTerminal(
            @Param("closedAt") Instant closedAt,
            @Param("closeReason") String closeReason
    );
}
