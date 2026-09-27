<script setup lang="ts">
import { computed, onMounted, ref, markRaw } from 'vue'
import type { Component } from 'vue'
import { SettingOutlined, BulbOutlined, DeploymentUnitOutlined, ClusterOutlined, CodeFilled, ControlOutlined, InfoCircleFilled, BuildFilled, CaretDownFilled, DownloadOutlined } from '@antdv-next/icons'
import { useRoute, useRouter } from 'vue-router'
import { useSettingsStore } from './settings/useSettingsStore'
import { extMenus } from '../extensions/panels'

type Group = 'general' | 'appearance' | 'log' | 'download' | 'hotkeys' | 'about'

const { actions } = useSettingsStore()
const route = useRoute()
const router = useRouter()

/**
 * 内置一级菜单。
 *
 * 侧栏刻意收窄到「一个面板一件事」：
 *  - 原「系统与性能」「网络」已并入 `general`（都是程序的常规行为，拆开只是让人多点两次）；
 *  - 原「模型」已并入 `dsh`（令牌与余额本来就属于 DeepSeek 的配置）；
 *  - 原「环境」「DeepSeek」两面板已整体迁入内置扩展 `xeonsky.harness`，以 `top: true`
 *    贡献回来平铺成一级项（见 topExtItems，插在「外观」之后，位置与迁移前一致）。
 * 剩余这些面板彼此不重叠，继续各自成一页。
 */
const menus: { key: Group; icon: Component }[] = [
    { key: 'general', icon: SettingOutlined },
    { key: 'appearance', icon: BulbOutlined },
    { key: 'log', icon: CodeFilled },
    { key: 'download', icon: DownloadOutlined },
    { key: 'hotkeys', icon: ControlOutlined },
    { key: 'about', icon: InfoCircleFilled }
]

/**
 * 扩展贡献的设置面板，按贡献声明的 `top` 分两组渲染：
 *  - `topExtItems` —— **平铺成一级项**（插在「外观」之后）。只给「从内置面板整体迁入
 *    扩展」的界面用（当前是 xeonsky.harness 的「环境」「DeepSeek」）：它们原是一级菜单，
 *    侧栏结构不应因这次搬迁而改变；
 *  - `groupedExtItems` —— 其余扩展面板，统一收在「扩展」一级项之下。
 *
 * 之所以把普通扩展面板收拢：它们是**可变集合**（扩展可以装卸、可以停用），与内置那排
 * 固定一级菜单性质不同；平铺在一起时，用户分不清哪一项是程序自带、哪一项来自某个扩展。
 * `top` 是内置扩展的迁移特例 —— 那些面板本就是外壳的一部分，只是实现挪了目录。
 *
 * 「扩展管理」页本身走 grouped 通路（由内置扩展 `xeonsky.extm` 贡献），外壳不为它写特例。
 */
const extItems = computed(() => extMenus())

/** 平铺一级的迁移面板（top: true），声明顺序即侧栏顺序。 */
const topExtItems = computed(() => extItems.value.filter((m) => m.top))

/** 收进「扩展」组的普通扩展面板。 */
const groupedExtItems = computed(() => extItems.value.filter((m) => !m.top))

/**
 * 扩展面板的图标：扩展只能给**图标名**（字符串），外壳统一映射成 `<BuildFilled />` ——
 * 扩展不允许传组件进来，否则等于让它往外壳的 JS 上下文里注入任意实现。
 *
 * 之所以所有扩展项用同一个图标（而不是继续查 {@link EXT_ICONS} 那张表）：它们已经是
 * 二级子项，被折叠在「扩展」一级项之下，各自的图标反而让层级更乱；统一图标把
 * 「这一组都是扩展」这件事表达得更清楚。
 */
const EXT_ICON: Component = markRaw(BuildFilled)

/**
 * top 平铺项的图标：按贡献的 `icon` **名**解析（扩展不能传组件，只能报名字）。
 * 「环境」「DeepSeek」迁自内置面板，沿用迁移前的一级菜单图标；不在表内的名字
 * 回落到统一扩展图标（{@link EXT_ICON}）。
 */
const EXT_TOP_ICONS: Record<string, Component> = {
    env: DeploymentUnitOutlined,
    dsh: ClusterOutlined
}

function topIconOf(name: string | undefined): Component {
    return (name && EXT_TOP_ICONS[name]) || EXT_ICON
}

/**
 * 由当前子路由决定高亮分组。
 *
 * 内置面板的 name 是 `settings-<key>`；扩展贡献的面板走兜底路由（name 固定为
 * `settings-ext-panel`），key 在 `params.panelKey` 里 —— 两种都要能高亮，
 * 否则扩展面板在侧栏里点上去不亮。
 */
const activeGroup = computed<string>(() => {
    const n = route.name
    if (n === 'settings-ext-panel') {
        const p = route.params.panelKey
        return typeof p === 'string' ? p : Array.isArray(p) ? (p[0] ?? 'general') : 'general'
    }
    return typeof n === 'string' && n.startsWith('settings-') ? n.slice(9) : 'general'
})

/** 「扩展」一级项是否处于展开 / 高亮态（子项任一命中即算；top 平铺项不算 —— 它们是独立一级项）。 */
const extRootOn = computed(() => groupedExtItems.value.some((m) => m.key === activeGroup.value))

/** 分组是否收起（默认展开；用户手动折叠后保持）。 */
const extCollapsed = ref(false)

/** 实际渲染的扩展子项（收起时为空）。 */
const visibleExtItems = computed(() => (extCollapsed.value ? [] : groupedExtItems.value))

function go(g: string): void {
    void router.push(`/settings/${g}`)
}

/** 点「扩展」一级项：不导航（它没有自己的页面），只折叠 / 展开子项。 */
function toggleExt(): void {
    extCollapsed.value = !extCollapsed.value
}

const loading = ref(false)

// 进入设置时把磁盘设置填进 store（store 的 watch 会随之应用主题/语言）。
// dsh 的版本探测不在这里：它是「DeepSeek」面板（xeonsky.harness 贡献）自己的事，
// 由那个面板挂载时加载。
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
                <template v-for="m in menus" :key="m.key">
                    <button
                        type="button"
                        class="nav__item"
                        :class="{ on: activeGroup === m.key }"
                        @click="go(m.key)"
                    >
                        <el-icon :size="18"><component :is="m.icon" /></el-icon>
                        <span class="nav__label">{{ $t('sv.nav.' + m.key) }}</span>
                    </button>
                    <!-- 由内置面板整体迁入扩展的一级面板（top: true，当前是 xeonsky.harness
                         的「环境」「DeepSeek」）：插在「外观」之后 —— 与迁移前的菜单位置一致，
                         侧栏结构不因这次搬迁而变。 -->
                    <template v-if="m.key === 'appearance'">
                        <button
                            v-for="m2 in topExtItems"
                            :key="'ext-top-' + m2.extId + '-' + m2.key"
                            type="button"
                            class="nav__item"
                            :class="{ on: activeGroup === m2.key }"
                            @click="go(m2.key)"
                        >
                            <el-icon :size="18"><component :is="topIconOf(m2.icon)" /></el-icon>
                            <span class="nav__label">{{ $t(m2.titleKey) }}</span>
                        </button>
                    </template>
                    <!-- 「扩展」一级项紧随「下载」之后（锚点原在 dsh 上，该面板已迁入
                         harness 扩展并以 top 身份回到上面）：它承载的也是工具性的扩展能力。 -->
                    <template v-if="m.key === 'download'">
                        <button
                            type="button"
                            class="nav__item nav__item--root"
                            :class="{ on: extRootOn }"
                            @click="toggleExt"
                        >
                            <el-icon :size="18"><BuildFilled /></el-icon>
                            <span class="nav__label">{{ $t('sv.nav.extensions') }}</span>
                            <el-icon :size="12" class="nav__caret" :class="{ 'is-collapsed': extCollapsed }"><CaretDownFilled /></el-icon>
                        </button>
                        <!-- 各扩展贡献的二级面板：折叠在「扩展」之下，缩进一级。 -->
                        <button
                            v-for="m2 in visibleExtItems"
                            :key="'ext-' + m2.extId + '-' + m2.key"
                            type="button"
                            class="nav__item nav__item--sub"
                            :class="{ on: activeGroup === m2.key }"
                            @click="go(m2.key)"
                        >
                            <el-icon :size="16"><component :is="EXT_ICON" /></el-icon>
                            <span class="nav__label" :title="m2.extName">{{ $t(m2.titleKey) }}</span>
                        </button>
                    </template>
                </template>
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
    Hotkeys / About）以及扩展贡献的面板，留在本组件里既撑大文件、又让这层依赖不可见。
-->
