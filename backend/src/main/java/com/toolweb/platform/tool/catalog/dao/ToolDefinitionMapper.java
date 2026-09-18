package com.toolweb.platform.tool.catalog.dao;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.toolweb.platform.tool.catalog.entity.ToolDefinition;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Optional;

@Mapper
public interface ToolDefinitionMapper extends BaseMapper<ToolDefinition> {

    List<ToolDefinition> selectPublished();

    List<ToolDefinition> selectAllOrdered();

    Optional<ToolDefinition> selectBySlug(@Param("slug") String slug);

    Optional<ToolDefinition> selectPublishedBySlug(@Param("slug") String slug);

    int incrementPublishedUsage(@Param("slug") String slug);
}
