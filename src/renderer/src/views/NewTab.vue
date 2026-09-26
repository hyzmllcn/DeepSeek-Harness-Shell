<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { DeepSeekFilled, MessageFilled, ArrowRightOutlined, WalletFilled } from '@antdv-next/icons'
import { useAppIcon } from '../lib/appIcon'
import { useGoView } from '../shell/viewnav'
import { webTabs, activateTab, closeTab, activeTab, findTab, launchFromNewTab } from '../shell/tabs'

/**
 * 「新建标签页」导航页（内核视图，`WebHost.vue` 按 `kind === 'newtab'` 直挂）。
 *
 * 内容：Logo + 跳转框 + 顶部固定三站 + 常用站点网格。常用站点存在内核设置的
 * `browserShortcuts` 里（管理界面在「设置 → 常规 → 内嵌浏览器」），进入页面拉一次。
 *
 * ## 交互语义：跳转，不是搜索
 *
 * 输入框是「跳转」：判定交给主进程（`POST /shell/resolve-target`，规则在
 * `app/webview.ts` 的 resolveTarget）—— 不是网址就补 `https://` 去试，**不拼搜索引擎 URL**；
 * 「地址栏可搜」是另一个入口（resolve-input），两者语义刻意分开。
 *
 * ## 与外壳标签页模型的关系
 *
 * 本页是内核视图，可直接使用标签页模型：点固定三站切过去（顺带关掉本导航页 ——
 * 它是一次性的）、点常用站点/提交跳转经 `launchFromNewTab` 开动态标签页。
 */

/** 常用站点（与 Settings.browserShortcuts 同形）。 */
interface BrowserShortcut {
    title: string
    url: string
}

const q = ref('')
const shortcuts = ref<BrowserShortcut[]>([])

// 应用 Logo：随深浅色切换（深色用 icon-dark.png），见 appIcon.ts
const appIcon = useAppIcon()
const go = useGoView()

/** 搜索框聚焦：导航页是动态插入的标签页视图，`autofocus` 不一定生效，这里再显式聚焦一次。 */
const inputRef = ref<{ focus?: () => void } | null>(null)

/** 顶部固定三站（直达已有固定标签页）。图标与标题栏保持一致用实心。 */
const fixedSites = [
    { id: 'home', key: 'app.nav.ui', icon: DeepSeekFilled },
    { id: 'chat', key: 'app.nav.chat', icon: MessageFilled },
    { id: 'platform', key: 'app.nav.platform', icon: WalletFilled }
] as const

onMounted(async () => {
    void nextTick(() => inputRef.value?.focus?.())
    try {
        const s = await window.api.get('/settings')
        shortcuts.value = Array.isArray(s.browserShortcuts) ? s.browserShortcuts : []
    } catch {
        /* 读不到设置就只显示固定三站 */
    }
})

// ---- 与外壳标签页模型的交互 ----

/** 离开当前导航页（导航页是一次性的）。 */
function leave(act: () => void): void {
    const curId = webTabs.activeId
    const curKind = activeTab()?.kind
    act()
    if (curKind === 'newtab' && curId) {
        const cur = findTab(curId)
        if (cur) closeTab(curId)
    }
}

/** 点固定三站：切到对应固定标签页并关闭本导航页。 */
function goFixed(id: string): void {
    leave(() => activateTab(id))
}

/** 打开设置页（常用站点在「设置 → 常规 → 内嵌浏览器」里配置）。 */
function openSettings(): void {
    go('settings')
}

/** 点常用站点：开一个动态标签页并关掉本导航页。 */
function openUrl(url: string, title?: string): void {
    if (!url) return
    leave(() => launchFromNewTab(url, title || url))
}

/**
 * 提交跳转：判定交给主进程（`resolveTarget`），这里只按结论行事。
 * `catch` 的兜底也**不猜搜索引擎** —— 只补 `https://`。
 */
async function submit(): Promise<void> {
    const raw = q.value.trim()
    if (!raw) return
    let r: { kind: 'url' | 'external' | 'none'; url?: string }
    try {
        r = await window.api.post('/shell/resolve-target', { body: { raw } })
    } catch {
        r = { kind: 'url', url: /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) ? raw : `https://${raw}` }
    }
    if (r.kind === 'none' || !r.url) return
    if (r.kind === 'external') {
        await window.api.post('/shell/open-external', { body: { url: r.url } })
        return
    }
    // launchFromNewTab 自带「关掉来源导航页」的语义，不经 leave 再关一次
    launchFromNewTab(r.url, r.url)
}
</script>

<template>
    <div class="nt">
        <!-- 内层负责居中：外层是滚动容器，直接给它 justify-content:center 会在内容超屏时裁掉顶部 -->
        <div class="nt__inner">
            <img :src="appIcon" class="nt__logo" alt="" draggable="false" />
            <h1 class="nt__title">{{ $t('app.title') }}</h1>

            <form class="nt__search" @submit.prevent="submit">
                <!-- 回车只走表单的 submit：再挂 keyup.enter 会与原生隐式提交叠加，同一个目标开两个标签页 -->
                <el-input
                    ref="inputRef"
                    v-model="q"
                    class="nt__input pill-input"
                    :placeholder="$t('navPage.placeholder')"
                    clearable
                    autofocus
                />
                <el-button native-type="submit" type="primary" class="nt__go">
                    <el-icon :size="16"><ArrowRightOutlined /></el-icon>
                    <span>{{ $t('navPage.go') }}</span>
                </el-button>
            </form>

            <section class="nt__quick">
                <h2 class="nt__h">{{ $t('navPage.quick') }}</h2>
                <div class="nt__grid">
                    <button
                        v-for="site in fixedSites"
                        :key="site.id"
                        class="nt__cell"
                        type="button"
                        @click="goFixed(site.id)"
                    >
                        <span class="nt__badge nt__badge--brand"><el-icon :size="18"><component :is="site.icon" /></el-icon></span>
                        <span class="nt__label">{{ $t(site.key) }}</span>
                    </button>

                    <a
                        v-for="(sc, i) in shortcuts"
                        :key="i"
                        class="nt__cell"
                        href="#"
                        @click.prevent="openUrl(sc.url, sc.title)"
                    >
                        <span class="nt__badge">{{ (sc.title || '☆').slice(0, 1) }}</span>
                        <span class="nt__label">{{ sc.title }}</span>
                    </a>
                </div>

                <p v-if="!shortcuts.length" class="nt__empty">
                    <span>{{ $t('navPage.noShortcuts') }}</span>
                    <el-button text type="primary" size="small" @click="openSettings">
                        {{ $t('navPage.addInSettings') }}
                    </el-button>
                </p>
            </section>
        </div>
    </div>
</template>

<style scoped>
.nt {
    height: 100%;
    overflow-y: auto;
    background: var(--el-bg-color-page);
}
/*
 * 居中交给内层，并且用 min-height:100% 而不是给外层 justify-content:center：
 * 后者在内容高于容器时会连顶部一起裁掉，且滚不上去（flex 居中的老问题）。
 */
.nt__inner {
    box-sizing: border-box;
    min-height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 32px 24px 48px;
}
.nt__logo {
    width: 64px;
    height: 64px;
    border-radius: 16px;
    -webkit-user-drag: none;
}
.nt__title {
    margin: 4px 0 18px;
    font-size: 20px;
    font-weight: 700;
}
.nt__search {
    display: flex;
    gap: 8px;
    width: min(680px, 92%);
}
.nt__input {
    flex: 1 1 auto;
}
.nt__go {
    flex: 0 0 auto;
}
.nt__quick {
    margin-top: 34px;
    width: min(680px, 92%);
}
.nt__h {
    font-size: 14px;
    color: var(--el-text-color-secondary);
    margin: 0 0 12px;
    font-weight: 600;
}
.nt__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
    gap: 10px;
}
.nt__cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 14px 8px;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 12px;
    background: var(--el-fill-color-blank);
    color: var(--el-text-color-primary);
    text-decoration: none;
    font-size: 13px;
    cursor: pointer;
    overflow: hidden;
    transition: border-color 0.15s, background 0.15s, color 0.15s;
}
.nt__cell:hover {
    border-color: var(--el-color-primary);
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
}
/* 键盘操作时给个可见焦点圈（鼠标点击不显示，避免多余的描边） */
.nt__cell:focus-visible {
    outline: 2px solid var(--el-color-primary);
    outline-offset: 2px;
}
.nt__badge {
    width: 30px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 9px;
    background: var(--el-fill-color);
    font-size: 15px;
}
.nt__badge--brand {
    color: var(--el-color-primary);
}
.nt__cell:hover .nt__badge {
    background: var(--el-color-primary-light-8);
}
/* 名称过长时省略，不撑破格子 */
.nt__label {
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}
.nt__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    font-size: 12px;
    color: var(--el-text-color-placeholder);
    margin-top: 6px;
}
</style>
