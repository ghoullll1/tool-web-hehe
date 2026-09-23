package com.toolweb.platform.tool.temporarychat.entity;

public enum ChatRole {
    CREATOR,
    PARTICIPANT;

    public ChatRole peer() {
        return this == CREATOR ? PARTICIPANT : CREATOR;
    }
}
