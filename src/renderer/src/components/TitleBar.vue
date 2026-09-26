<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Component } from 'vue'
import {
    DeepSeekFilled,
    MessageFilled,
    WalletFilled,
    SettingFilled,
    CloseOutlined,
    ReloadOutlined,
    PlusOutlined,
    StarOutlined,
    StarFilled
} from '@antdv-next/icons'
import { ElMessage } from 'element-plus'
import { tt } from '../lib/locales'
import WindowControls from './WindowControls.vue'
import { useView, useGoView } from '../shell/viewnav'
import {
    webTabs,
    activeTab,
    findTab,
    activateTab,
    closeTab,
    openTab,
    openNewTab,
    toggleKeep,
    tabLabel,
    FIXED_LABEL_KEY
} from '../shell/tabs'
import { shellMeta } from '../shell/state'
import { initFixedTabsPref, isFixedTabHidden } from '../shell/fixedTabs'
import { useTabDrag } from '../shell/useTabDrag'
import { NEWTAB_URL } from '@shared/types'

/**
 * 自绘标题栏：应用标识 + 固定站 / 跳核心按钮 + 浏览器式标签条 + 窗口控制，
 * 并连同跨窗口拖拽的「可接收遮罩 / 幽灵标签」与标签右键菜单一起渲染。
 *
 * 从 App.vue 抽出。它是**多根组件**：`<header>` 保持为 .shell 的直接 flex 子项（布局不变），
 * 其余根节点都是 position:fixed，不参与 flex 布局。故无需 props——标签状态来自 tabs.ts 单例，
 * 视图状态来自 viewnav.ts，窗口控制直接走 window.api。
 */
const view = useView()
const go = useGoView()

// 固定标签页「显示/隐藏」偏好的渲染层镜像（与设置页外观面板共用；含 settings:changed 订阅）。
initFixedTabsPref()

// 标签页拖拽：同窗口内拖动=排序；拖到其它窗口（其顶部标签栏亮浅蓝遮罩可接收）=把标签移过去。
const { bindTabsBar, onTabPointerDown, draggingTabId, slotBeforeId, hoverMask, ghost } = useTabDrag()

/**
 * 点击一个标签页：激活并确保显示在 web 宿主。
 * Ctrl/⌘+点击则改用系统浏览器打开该标签网址（与普通点击一致的处理入口）。
 */
function onTabClick(id: string, ev?: MouseEvent): void {
    if (ev && (ev.ctrlKey || ev.metaKey)) {
        const tab = findTab(id)
        if (tab?.url) {
            ev.preventDefault()
            void window.api.post('/shell/open-external', { body: { url: tab.url } })
            return
        }
    }
    activateTab(id)
    go('web')
}

/** 点击标签页关闭按钮。 */
function onTabClose(id: string): void {
    closeTab(id)
}

/** 点击“保活固定”按钮（仅动态标签页）。 */
function onTabKeep(id: string): void {
    toggleKeep(id)
}

/** 中键(mouse button 1)关闭标签页。 */
function onTabMouseDown(id: string, e: MouseEvent): void {
    if (e.button === 1) {
        e.preventDefault()
        closeTab(id)
    }
}

/** 右键菜单状态：位置 + 目标标签。 */
const ctx = ref<{ x: number; y: number; id: string } | null>(null)
function onTabContext(id: string, e: MouseEvent): void {
    ctx.value = { x: e.clientX, y: e.clientY, id }
}
function closeCtx(): void {
    ctx.value = null
}
/** 复制标签页。 */
function ctxDup(): void {
    const tab = ctx.value ? findTab(ctx.value.id) : undefined
    closeCtx()
    if (!tab) return
    if (tab.kind === 'newtab') openNewTab()
    else openTab(tab.url ?? '', tab.title)
}
/** 关闭标签页。 */
function ctxClose(): void {
    const id = ctx.value?.id
    closeCtx()
    if (id) closeTab(id)
}

/** 在新窗口打开：把该标签目标（动态页 URL，或内置导航页伪链接 dssh://about:blank）开到一个独立窗口。 */
async function ctxOpenWindow(): Promise<void> {
    const tab = ctx.value ? findTab(ctx.value.id) : undefined
    closeCtx()
    if (!tab) return
    const target = tab.kind === 'newtab' ? NEWTAB_URL : tab.url
    if (target) await window.api.post('/shell/open-url', { body: { url: target } })
}

/** 移动到其它窗口：弹出目标窗口选择；目标开该标签（含内置导航页），再从本窗口移除；取消则保留。 */
async function ctxMove(): Promise<void> {
    const tab = ctx.value ? findTab(ctx.value.id) : undefined
    closeCtx()
    if (!tab) return
    const target = tab.kind === 'newtab' ? NEWTAB_URL : tab.url
    if (!target) return
    const moved = await window.api.post('/shell/move-tab', { body: { url: target } })
    if (moved) closeTab(tab.id)
    // 「没有其它窗口可接收」时主进程返回 false；不说一声的话就是点了没反应
    else ElMessage.info(tt('app.tabs.moveWindowNoTarget'))
}

/** 跳转到核心窗口（副窗口用）：经 IPC 聚焦当前核心窗口；无核心则主进程重建一个。 */
async function jumpToCore(): Promise<void> {
    await window.api.post('/shell/focus-core')
}

/** 滚轮滚动标签条时改为横向滚动。 */
function onTabsWheel(e: WheelEvent): void {
    const el = e.currentTarget as HTMLElement | null
    if (!el || el.scrollWidth <= el.clientWidth) return
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    if (delta === 0) return
    el.scrollLeft += delta
}

/** ＋ 新建：开一个内置标签页导航（导航页是内核视图 views/NewTab.vue）。 */
function onPlus(): void {
    openNewTab()
    go('web')
}

/** 动态/新标签页（由新开链接/＋ 产生）；固定三站以图标按钮呈现，不在此列。 */
const dynamicTabs = computed(() => webTabs.list.filter((tab) => tab.kind === 'dynamic' || tab.kind === 'newtab'))

/** 某个 web 标签是否当前激活（仅 web 宿主视图内高亮）。 */
function isWebActive(id: string): boolean {
    return view.value === 'web' && webTabs.activeId === id
}

/** 某个 web 标签是否当前激活（仅 web 宿主视图内高亮）。 */
const navVisible = computed(() => view.value === 'web' && activeTab()?.kind === 'dynamic')
/** 激活的是否三个固定站之一（固定站才显示标题栏旧版刷新按钮）。 */
const fixedPageReload = computed(() => {
    if (view.value !== 'web') return false
    const k = activeTab()?.kind
    return k === 'home' || k === 'chat' || k === 'platform'
})

/** 内置三固定站的图标（扩展贡献的固定页没有专属图标，用首字符徽标代替）。 */
const FIXED_ICONS: Record<'home' | 'chat' | 'platform', Component> = {
    home: DeepSeekFilled,
    chat: MessageFilled,
    platform: WalletFilled
}

/**
 * 标题栏左侧的固定标签页（内置三站 + 扩展贡献的 fixed 页）：
 *  - 仅核心窗口显示（副窗口只有「跳核心」按钮）；
 *  - 按「设置 → 外观 → 固定标签页」的开关过滤隐藏项（fixedTabsPref 镜像是响应式的，
 *    设置页切换开关后这里即时重算）。
 */
const quickTabs = computed(() => {
    if (!shellMeta.isCore) return []
    const out: Array<{ id: string; label: string; icon?: Component; badge?: string }> = []
    for (const kind of ['home', 'chat', 'platform'] as const) {
        if (isFixedTabHidden(kind) || !findTab(kind)) continue
        out.push({ id: kind, label: tt(FIXED_LABEL_KEY[kind]), icon: FIXED_ICONS[kind] })
    }
    for (const t of webTabs.list) {
        if (t.kind !== 'fixed' || isFixedTabHidden(t.id)) continue
        const label = tabLabel(t)
        out.push({ id: t.id, label, badge: label.trim().charAt(0).toUpperCase() || '?' })
    }
    return out
})

const winReload = (): void => void window.api.post('/dsh/reload')
</script>

<template>
    <header class="titlebar" :class="{ 'titlebar--flush': navVisible }">
        <div class="left">
            <!-- 程序图标已移除：左缘直接是固定标签页区（窗口名由系统任务栏 / 标题承担） -->
            <div class="quick">
                <template v-if="shellMeta.isCore">
                    <el-tooltip v-for="ft in quickTabs" :key="ft.id" :content="ft.label" placement="bottom" :show-after="300">
                        <button class="icon-btn" :class="{ active: isWebActive(ft.id) }" type="button" @click="onTabClick(ft.id, $event)">
                            <el-icon v-if="ft.icon"><component :is="ft.icon" /></el-icon>
                            <span v-else class="quick__badge">{{ ft.badge }}</span>
                        </button>
                    </el-tooltip>
                </template>
                <template v-else>
                    <el-tooltip :content="$t('app.jumpCoreHint')" placement="bottom" :show-after="300">
                        <button class="icon-btn core-jump" type="button" @click="jumpToCore">
                            <el-icon :size="18"><DeepSeekFilled /></el-icon>
                            <span class="core-jump__txt">{{ $t('app.jumpCore') }}</span>
                        </button>
                    </el-tooltip>
                </template>
                <span class="divider" />
            </div>

            <!-- 动态标签页条：可开很多，多标签时原生横向滚动；空白区可拖窗口 -->
            <div class="tabs" :ref="bindTabsBar" @wheel="onTabsWheel">
                <div
                    v-for="tab in dynamicTabs"
                    :key="tab.id"
                    class="tab"
                    :class="{ on: isWebActive(tab.id), dragging: draggingTabId === tab.id, slot: slotBeforeId === tab.id }"
                    :title="tab.url ?? ''"
                    @click="onTabClick(tab.id, $event)"
                    @mousedown="onTabMouseDown(tab.id, $event)"
                    @contextmenu.prevent="onTabContext(tab.id, $event)"
                    @pointerdown="onTabPointerDown(tab, $event)"
                >
                    <span class="tab__label">{{ tabLabel(tab) }}</span>
                    <button
                        v-if="tab.kind === 'dynamic'"
                        class="tab__pin"
                        :class="{ on: tab.keep }"
                        type="button"
                        :title="$t('app.tabs.keep')"
                        @click.stop="onTabKeep(tab.id)"
                    >
                        <el-icon :size="11"><component :is="tab.keep ? StarFilled : StarOutlined" /></el-icon>
                    </button>
                    <button
                        class="tab__x"
                        type="button"
                        :title="$t('app.tabs.close')"
                        @click.stop="onTabClose(tab.id)"
                    >
                        <el-icon :size="12"><CloseOutlined /></el-icon>
                    </button>
                </div>

                <button class="tab tab--add" type="button" :title="$t('app.tabs.new')" @click="onPlus">
                    <el-icon :size="16"><PlusOutlined /></el-icon>
                </button>
            </div>
        </div>

        <div class="right">
            <!-- Chrome 式右侧按钮带：条件刷新(固定站) + 设置 + 窗口控制，全高无间隙、关闭钮贴右上角 -->
            <el-tooltip v-if="fixedPageReload" :content="$t('app.reload')" placement="bottom" :show-after="300">
                <button class="wbtn" type="button" @click="winReload">
                    <el-icon><ReloadOutlined /></el-icon>
                </button>
            </el-tooltip>
            <el-tooltip :content="$t('app.nav.settings')" placement="bottom" :show-after="300">
                <button
                    class="wbtn"
                    :class="{ active: view === 'settings' }"
                    type="button"
                    @click="go('settings')"
                >
                    <el-icon><SettingFilled /></el-icon>
                </button>
            </el-tooltip>
            <WindowControls />
        </div>
    </header>

    <!-- 跨窗口拖拽：本窗口被悬停为目标 → 顶部标签栏浅蓝遮罩表示可接收 -->
    <div v-if="hoverMask" class="tab-drop-mask"></div>
    <div v-if="ghost.visible" class="tab-ghost" :style="{ left: ghost.x + 'px', top: ghost.y + 'px' }">
        {{ ghost.text }}
    </div>

    <template v-if="ctx">
        <div class="ctx-bk" @mousedown="closeCtx" @contextmenu.prevent="closeCtx" />
        <div class="ctx" :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }">
            <button type="button" @click="ctxDup">{{ $t('app.tabs.dup') }}</button>
            <button type="button" @click="ctxClose">{{ $t('app.tabs.close') }}</button>
            <span class="ctx__sep" />
            <button type="button" @click="ctxOpenWindow">{{ $t('app.tabs.openWindow') }}</button>
            <button type="button" @click="ctxMove">{{ $t('app.tabs.moveWindow') }}</button>
        </div>
    </template>
</template>

<style scoped>
.titlebar {
    -webkit-app-region: drag;
    flex: 0 0 auto;
    height: var(--titlebar-h, 44px);
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    gap: 8px;
    /* 左右都不留内边距：Logo 贴窗口左缘，右侧关闭钮贴窗口右上角（Chrome 式） */
    padding: 0;
    /* 下边框改用 inset 阴影画：不占布局高度；标签条区会被其底色/激活卡片盖住（连通效果） */
    box-shadow: inset 0 -1px 0 var(--el-border-color-light);
    /* 整条标题栏钦定浅灰 #f3f3f3（Chrome 观感），固定值不随主题变量 */
    background: #f3f3f3;
    user-select: none;
}
/* 动态标签页显示网址导航栏时，去掉标题栏下边框，使标题栏与网址栏无缝相连 */
.titlebar--flush {
    box-shadow: none;
}
.left {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
}
.right {
    flex: 0 0 auto;
    display: flex;
    align-items: stretch;
    gap: 0;
}
/* 标题栏里的按钮可点不可拖；非按钮区域(分割线/空隙)随容器可拖 */
.titlebar .icon-btn,
.titlebar .wbtn {
    -webkit-app-region: no-drag;
}
/* .divider / .icon-btn / .wbtn / .wglyph 已上提到 styles/shared.css。 */
/* 左侧快捷站与标签条之间的分割线：去掉右侧外边距，紧贴标签条 */
.quick .divider {
    margin-right: 0;
}
/* 设置按钮的激活态：设置页打开时图标着主色（Chrome 式按钮不带底色激活） */
.wbtn.active {
    color: var(--el-color-primary);
}
.icon-btn.core-jump {
    width: auto;
    padding: 0 10px;
    gap: 6px;
    font-size: 13px;
}
.core-jump__txt {
    white-space: nowrap;
}
/* ---- 固定标签页图标区 + 浏览器标签条 ---- */
.quick {
    display: flex;
    align-items: center;
    gap: 2px;
    /* 程序图标已删，留一点左内边距让首个按钮不贴死窗口边缘 */
    padding-left: 6px;
}
/* 扩展贡献的固定页没有专属图标：渲染首字符徽标 */
.quick__badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 5px;
    background: var(--el-color-primary-light-8);
    color: var(--el-color-primary);
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
}
.tabs {
    /* 容器可拖窗口；空白（含标签少时右侧）即可拖动，多标签时原生横向滚动。
       Chrome 式：整条标签区通高（stretch 顶满标题栏）、底色透明继承标题栏 #f3f3f3，
       激活标签以背景色圆顶卡片凸出并盖住标题栏底边框、与下方内容连成一体。 */
    -webkit-app-region: drag;
    flex: 1 1 auto;
    align-self: stretch;
    min-width: 0;
    display: flex;
    align-items: stretch;
    gap: 0;
    /* 顶部预留 2px（Chrome 同款：标签不顶到窗口上缘），底部不留——激活卡片要与内容连通 */
    padding: 2px 6px 0;
    overflow-x: auto;
    scrollbar-width: thin;
    background: transparent;
}
.tab {
    -webkit-app-region: no-drag;
    flex: 0 1 auto;
    min-width: 110px;
    max-width: 230px;
    padding: 0 8px 0 12px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: none;
    border-radius: 10px 10px 0 0;
    background: transparent;
    color: var(--el-text-color-secondary);
    font-size: 13px;
    white-space: nowrap;
    cursor: pointer;
    user-select: none;
}
.tab:hover {
    background: var(--el-fill-color-dark);
}
.tab.on {
    background: var(--el-bg-color);
    color: var(--el-text-color-primary);
}
.tab__label {
    overflow: hidden;
    text-overflow: ellipsis;
}
/* 保活固定按钮（星标，点亮即保活且不计入名额） */
.tab__pin {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--el-text-color-placeholder);
    cursor: pointer;
}
.tab__pin:hover {
    background: var(--el-fill-color);
    color: var(--el-text-color-primary);
}
.tab__pin.on {
    color: var(--el-color-warning);
}
.tab__x {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--el-text-color-placeholder);
    cursor: pointer;
}
.tab__x:hover {
    background: var(--el-fill-color);
    color: var(--el-text-color-primary);
}
.tab--add {
    -webkit-app-region: no-drag;
    flex: 0 0 auto;
    align-self: center; /* 不随标签通高：居中的小方块按钮 */
    min-width: 0; /* 覆盖 .tab 的 min-width，＋ 按钮不做最小宽度 */
    width: 28px;
    height: 28px;
    margin-left: 4px;
    justify-content: center;
    padding: 0;
    border-radius: 6px;
}
/* ---- 拖拽：正在拖的标签、本地插入位置、跨窗可接收遮罩、幽灵标签 ---- */
.tab {
    touch-action: none;
}
.tab.dragging {
    opacity: 0.5;
}
.tab.slot {
    box-shadow: -2px 0 0 0 var(--el-color-primary);
}
/* 跨窗口拖拽时，目标窗口顶部的“可接收”浅蓝遮罩带 */
.tab-drop-mask {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: calc(var(--titlebar-h, 44px) + 4px);
    z-index: 60;
    pointer-events: none;
    /* 跟随「配色方案」的主色（原来写死 Element 蓝，换方案时会突兀地残留蓝色）。
        color-mix(in srgb, X N%, transparent) 等价于 X 的 N% 透明度。 */
    background: color-mix(in srgb, var(--el-color-primary) 16%, transparent);
    border-bottom: 1px dashed color-mix(in srgb, var(--el-color-primary) 75%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--el-color-primary) 30%, transparent);
}
/* 拖动时跟随指针的半透明幽灵标签 */
.tab-ghost {
    position: fixed;
    z-index: 3000;
    max-width: 240px;
    padding: 5px 12px;
    font-size: 13px;
    line-height: 1.4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    /* 半透明浮层：底色/文字跟随主题变量，深色下不再是一块刺眼的白药丸 */
    background: var(--el-bg-color);
    color: var(--el-text-color-primary);
    border: 1px solid color-mix(in srgb, var(--el-color-primary) 60%, transparent);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    pointer-events: none;
    opacity: 0.92;
}
/* ---- 标签页右键菜单 ---- */
.ctx-bk {
    position: fixed;
    inset: 0;
    z-index: 3000;
}
.ctx {
    position: fixed;
    z-index: 3001;
    min-width: 150px;
    padding: 4px;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--el-border-color-light);
    border-radius: 8px;
    background: var(--el-bg-color);
    box-shadow: var(--el-box-shadow-light);
}
.ctx button {
    width: 100%;
    text-align: left;
    border: none;
    background: transparent;
    padding: 7px 10px;
    border-radius: 6px;
    font-size: 13px;
    color: var(--el-text-color-regular);
    cursor: pointer;
}
.ctx button:hover:not(:disabled) {
    background: var(--el-fill-color);
}
.ctx__sep {
    height: 1px;
    background: var(--el-border-color-lighter);
    margin: 4px 0;
}
</style>
