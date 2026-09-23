package com.toolweb.platform.tool.fileshare.dao;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.toolweb.platform.tool.fileshare.entity.TemporaryFileShare;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Mapper
public interface TemporaryFileShareMapper extends BaseMapper<TemporaryFileShare> {

    Optional<TemporaryFileShare> selectForUpdate(@Param("pickupCodeDigest") String pickupCodeDigest);

    List<TemporaryFileShare> selectExpiredActive(
            @Param("expiresAt") Instant expiresAt,
            @Param("limit") int limit
    );

    boolean existsActiveByObjectKey(@Param("objectKey") String objectKey);

    int markDeleted(
            @Param("shareId") String shareId,
            @Param("deletedAt") Instant deletedAt,
            @Param("version") long version
    );
}
