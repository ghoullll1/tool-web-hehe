package com.toolweb.platform.tool.catalog.entity;

import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;

import java.time.Instant;

@TableName("tool_definition")
public class ToolDefinition {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String slug;

    private String displayName;

    private String description;

    private String categoryCode;

    private String iconKey;

    private String routePath;

    private ExecutionMode executionMode;

    private String frontendKey;

    private String backendKey;

    private boolean enabled;

    private int sortOrder;

    @TableField(updateStrategy = FieldStrategy.NEVER)
    private long usageCount;

    @Version
    private long version;

    @TableField(insertStrategy = FieldStrategy.NEVER, updateStrategy = FieldStrategy.NEVER)
    private Instant createdAt;

    @TableField(insertStrategy = FieldStrategy.NEVER, updateStrategy = FieldStrategy.NEVER)
    private Instant updatedAt;

    protected ToolDefinition() {
    }

    public Long id() { return id; }
    public String slug() { return slug; }
    public String displayName() { return displayName; }
    public String description() { return description; }
    public String categoryCode() { return categoryCode; }
    public String iconKey() { return iconKey; }
    public String routePath() { return routePath; }
    public ExecutionMode executionMode() { return executionMode; }
    public String frontendKey() { return frontendKey; }
    public String backendKey() { return backendKey; }
    public boolean enabled() { return enabled; }
    public int sortOrder() { return sortOrder; }
    public long usageCount() { return usageCount; }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }
}
