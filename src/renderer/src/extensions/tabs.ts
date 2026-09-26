import { watch } from 'vue'
import { extState } from './store'
import { openTab, findTab, webTabs, upsertFixedTab, removeFixedTab } from '../shell/tabs'
import { shellMeta } from '../shell/state'
import { tt } from '../lib/locales'
import { isTabViewContribution } from './tabviews'

/**
 * 渲染层控制点 1：**标签页**。
 *
 * 扩展能做的有三条：
 *   1. 声明一个 URL，外壳把它当普通动态标签页打开 —— 这正好复用了现成的标签页模型
 *      （`shell/tabs.ts` 的 `openTab`）：扩展标签页与用户手动开的动态页**完全同质**，
 *      共享保活、关闭、拖拽等全部既有行为，不需要给 `WebTabKind` 加新种类；
 *   2. 声明 `fixed: true`，把它做成**固定标签页**：常驻标题栏左侧图标区（与内置
 *      home/chat/platform 同待遇，不可关闭、打开过即保活）。贡献消失（扩展停用 /
 *      卸载）时自动撤下；用户也能在「设置 → 外观 → 固定标签页」里隐藏它；
 *   3. 声明一个 `view`（程序内置标签页视图）—— 这不是「要开一个标签页」，
 *      而是「提供一个不经过 webview 的标签页界面」（如新建标签页页）。
 *      这类贡献由外壳在渲染时按名挂载（见 `tabviews.ts`），**不在这里被打开**。
 *
 * 为什么不在标签栏塞一个"扩展页入口"列表：那等于给扩展开第三个控制点，
 * 而用户限定的能力面只有两个（标签页 + 设置页）。扩展想被打开，
 * 要么 `openOnStart` 自动开一次，要么由用户在扩展设置面板里点（复用搜索/新建页的既有入口）。
 */

/** 已自动打开过的贡献 key（`<extId>/<key>`），避免每次刷新重复开。 */
const autoOpened = new Set<string>()

/** 给扩展标签页一个稳定的 id：`ext-<extId>-<key>`，便于查找与去重。 */
export function extTabId(extId: string, key: string): string {
    return `ext-${extId}-${key}`
}

/**
 * 打开（或聚焦）某扩展的标签页。
 *
 * 已存在则激活它，不重复开 —— 扩展入口常被当"设置/面板"点，
 * 每次都新开一个会让标签栏堆积。
 *
 * `view` 型贡献没有可打开的 URL，直接忽略（它们不是标签页，是视图声明）。
 */
export function openExtTab(extId: string, key: string): void {
    const contribution = extState.tabs.find((t) => t.extId === extId && t.key === key)
    if (!contribution?.url) return
    const id = extTabId(extId, key)
    const existing = findTab(id)
    if (existing) {
        webTabs.activeId = id
        existing.used = Date.now()
        return
    }
    // 复用 openTab 的构造逻辑，再把 id 改成稳定值（openTab 生成的是时间戳 id）。
    // openTab 的 title 是**展示文本**而非 i18n 键，故这里先把贡献的 titleKey 译好再传入，
    // 否则标签栏会直接显示 'ext.tab.xxx' 这样的原始键。
    const tab = openTab(contribution.url, tt(contribution.titleKey))
    tab.id = id
    webTabs.activeId = id
}

/**
 * 把「固定标签页」贡献同步进标签模型（幂等）：
 *  - 贡献出现 → 插入常驻标签页（不激活：固定页与内置三站一样静静待在左侧）；
 *  - 贡献消失（扩展停用 / 卸载 / 改掉了 fixed 声明）→ 撤下对应标签页；
 *  - URL 变了 → 原地更新。
 *
 * 依赖 `shellMeta.isCore` 一并重跑：非核心窗口的 `setCoreRole(false)` 会把 fixed
 * 种类的标签整体清掉，窗口接管成为核心后要按贡献点补回来。
 */
function syncFixedTabs(): void {
    const wanted = new Map<string, string>() // 标签 id → 目标 URL
    for (const c of extState.tabs) {
        if (!c.fixed || !c.url || isTabViewContribution(c)) continue
        wanted.set(extTabId(c.extId, c.key), c.url)
    }
    // 先撤不再被贡献的，再原地更新仍在贡献的
    for (const t of [...webTabs.list]) {
        if (t.kind !== 'fixed') continue
        const url = wanted.get(t.id)
        if (url === undefined) removeFixedTab(t.id)
        else if (t.url !== url) t.url = url
        wanted.delete(t.id)
    }
    // 剩下的就是新增：titleKey 现在翻译成展示文本（与 openExtTab 同一取舍，
    // 语言切换后已存在的固定页标题要等下次同步才刷新 —— 与动态页标题行为一致）。
    for (const [id, url] of wanted) {
        const c = extState.tabs.find((t) => extTabId(t.extId, t.key) === id)
        if (c?.url) upsertFixedTab({ id, title: tt(c.titleKey), url })
    }
}

/**
 * 注册标签页控制点：
 *  - 贡献点 / 窗口核心角色变化 → 同步固定标签页（幂等，防重复）；
 *  - `openOnStart` 的扩展标签页自动打开一次（fixed 贡献除外 —— 它们常驻左侧，无需开一次）。
 *
 * 用 watch 而不是在拉取时直接处理：拉取是异步的，且可能多次刷新（启用/停用扩展）；
 * watch 保证"贡献点真正生效"这一刻才动作，且 autoOpened 集合防重复。
 */
export function registerExtTabs(): void {
    watch(
        () =>
            extState.tabs.map((t) => `${t.extId}/${t.key}/${t.fixed ? 'f' : ''}`).join(',') +
            `|core=${shellMeta.isCore}`,
        syncFixedTabs,
        { immediate: true }
    )
    watch(
        () => extState.tabs.map((t) => `${t.extId}/${t.key}`).join(','),
        () => {
            for (const tab of extState.tabs) {
                if (!tab.openOnStart) continue
                if (tab.fixed) continue // 固定标签页常驻左侧，不走「自动打开一次」
                if (isTabViewContribution(tab)) continue // 视图声明不是标签页
                const marker = `${tab.extId}/${tab.key}`
                if (autoOpened.has(marker)) continue
                autoOpened.add(marker)
                openExtTab(tab.extId, tab.key)
            }
        },
        { immediate: true }
    )
}
