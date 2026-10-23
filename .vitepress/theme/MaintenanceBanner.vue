<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'

const { lang } = useData()
const zh = computed(() => lang.value.toLowerCase().startsWith('zh'))
</script>

<template>
    <div class="dsb-maintenance-banner" role="note">
        <span v-if="zh">
            DeepSeek 官方已发布桌面应用，本项目<strong>不再积极维护</strong>，建议优先使用官方版本。
        </span>
        <span v-else>
            DeepSeek has released its official desktop app; this project is <strong>no longer actively maintained</strong>.
            Please use the official version instead.
        </span>
    </div>
</template>
