<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { Component } from 'vue'
import {
    SettingOutlined,
    BulbOutlined,
    DeploymentUnitOutlined,
    ClusterOutlined,
    CodeFilled,
    ControlOutlined,
    InfoCircleFilled,
    DownloadOutlined
} from '@antdv-next/icons'
import { useRoute, useRouter } from 'vue-router'
import { useSettingsStore } from './settings/useSettingsStore'

type Group = 'general' | 'appearance' | 'env' | 'dsh' | 'log' | 'download' | 'hotkeys' | 'about'

const { actions } = useSettingsStore()
const route = useRoute()
const router = useRouter()

/**
 * 内置一级菜单。
 *
 * 侧栏刻意收窄到「一个面板一件事」：
 *  - 原「系统与性能」「网络」已并入 `general`（都是程序的常规行为，拆开只是让人多点两次）；
 *  - 「环境」「DeepSeek」仍是独立一级项：前者的 Node / npm 来源与后者在语义上并不重叠
 *    （「模型」页的令牌与余额已并入 `dsh`）。
 */
const menus: { key: Group; icon: Component }[] = [
    { key: 'general', icon: SettingOutlined },
    { key: 'appearance', icon: BulbOutlined },
    { key: 'env', icon: DeploymentUnitOutlined },
    { key: 'dsh', icon: ClusterOutlined },
    { key: 'log', icon: CodeFilled },
    { key: 'download', icon: DownloadOutlined },
    { key: 'hotkeys', icon: ControlOutlined },
    { key: 'about', icon: InfoCircleFilled }
]

/**
 * 由当前子路由决定高亮分组。
 *
 * 内置面板的 name 是 `settings-<key>`，直接切前缀即可。
 */
const activeGroup = computed<string>(() => {
    const n = route.name
    return typeof n === 'string' && n.startsWith('settings-') ? n.slice(9) : 'general'
})

function go(g: string): void {
    void router.push(`/settings/${g}`)
}

const loading = ref(false)

// 进入设置时把磁盘设置填进 store（store 的 watch 会随之应用主题/语言）。
// dsh 的版本探测不在这里：它是「DeepSeek」面板自己的事，由那个面板挂载时加载。
onMounted(async () => {
    loading.value = true
    try {
        const s = await window.api.get('/settings')
        actions.fillFrom(s)
    } finally {
        loading.value = false
    }
})
</script>

<template>
    <div class="settings">
        <aside class="side">
            <div class="side__cap">{{ $t('sv.cap') }}</div>
            <nav class="nav">
                <button
                    v-for="m in menus"
                    :key="m.key"
                    type="button"
                    class="nav__item"
                    :class="{ on: activeGroup === m.key }"
                    @click="go(m.key)"
                >
                    <el-icon :size="18"><component :is="m.icon" /></el-icon>
                    <span class="nav__label">{{ $t('sv.nav.' + m.key) }}</span>
                </button>
            </nav>
        </aside>

        <div class="main">
            <!-- 页头由各子页自带（大图标标题头），此处不再渲染 -->
            <el-scrollbar v-loading="loading" class="main__scroll">
                <div class="cols">
                    <router-view />
                </div>
            </el-scrollbar>
        </div>
    </div>
</template>

<!--
    样式已抽到 src/renderer/src/styles/settings.css（非 scoped 的全局样式，由 main.ts 统一加载）。
    它要同时作用于经 <router-view> 嵌套渲染的子面板（General / Appearance / Env / DeepSeek / Log /
    Hotkeys / About）；留在本组件里既撑大文件、又让这层依赖不可见。
-->
