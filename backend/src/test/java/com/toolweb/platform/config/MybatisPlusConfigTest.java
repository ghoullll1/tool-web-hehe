package com.toolweb.platform.config;

import com.baomidou.mybatisplus.extension.plugins.inner.OptimisticLockerInnerInterceptor;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class MybatisPlusConfigTest {

    @Test
    void enablesOptimisticLockingForVersionedEntities() {
        var interceptor = new MybatisPlusConfig().mybatisPlusInterceptor();

        assertThat(interceptor.getInterceptors())
                .singleElement()
                .isInstanceOf(OptimisticLockerInnerInterceptor.class);
    }
}
