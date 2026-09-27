import type { Component } from 'vue'
import { parseExtViewTarget } from '@shared/types'
import { extState } from './store'

/**
 * 渲染层控制点 1 的**视图侧**：程序内置标签页视图。
 *
 * ## 这是什么
 *
 * 标签页控制点原先只能贡献「一个 URL」—— 外壳把它当普通动态标签页打开
 * （见 `tabs.ts`）。但有一类标签页**天然不该是网页**：它们的内容是程序自己的界面。
 *
 * 两条通路，同一张登记表：
 *  1. 贡献项带 `view`（视图名）—— 一条「视图注册声明」，外壳按名字到
 *     {@link LOCAL_TAB_VIEWS} 查实现；它**不会**被 `registerExtTabs` 打开成标签页；
 *  2. 贡献项的 `url` 填内置伪链接 **`dssh://view/<视图名>`**（`parseExtViewTarget`）——
 *     这是一条**真实存在的标签页**（动态或固定均可，由同步器/打开逻辑正常管理），
 *     只是渲染时不进 webview，而按视图名挂载本地组件。第一个使用者是
 *     Harness 安装向导（`xeonsky.harness` 的 `dssh://view/harness-wizard`）。
 *
 * 规则与设置面板的 `LOCAL_VIEWS` 完全一致 —— **只有内置 / 系统扩展能解析**
 * （外部扩展若能注入组件，就等于在外壳的 DOM 与 JS 上下文里执行任意代码）。
 *
 * ## 现状
 *
 * 内核自己的「新建标签页」导航页**不经**此机制（它是内核视图 `views/NewTab.vue`，
 * 由 `WebHost.vue` 按 `kind === 'newtab'` 直挂）。
 */

/**
 * 外壳登记的标签页视图实现：`view` 名 → 组件。
 *
 * 只放**内置 / 系统**扩展的实现（随构建进包）；外部扩展即使声明了同名 view
 * 也拿不到这里的组件（{@link resolveTabView} 会按 kind 判定）。
 */
const LOCAL_TAB_VIEWS: Record<string, () => Promise<Component>> = {
    // Harness 安装向导（由内置扩展 xeonsky.harness 贡献的固定伪链接标签页）。
    'harness-wizard': () => import('@ext/xeonsky.harness/WizardTab.vue')
}

/**
 * 解析某标签页视图名对应的组件加载器。
 *
 * @param kind 扩展级别；**只有内置 / 系统**才允许解析本地视图，外部扩展一律 undefined。
 */
export function resolveTabView(view: string | undefined, kind: string | undefined): (() => Promise<Component>) | undefined {
    if (!view) return undefined
    if (kind !== 'builtin' && kind !== 'system') return undefined
    return LOCAL_TAB_VIEWS[view]
}

/**
 * 按**标签页**解析本地视图：URL 是 `dssh://view/<名>` 伪链接时，反查贡献来源扩展
 * （按 url 匹配生效中的标签页贡献），只有内置 / 系统扩展才返回组件加载器。
 *
 * `WebHost.vue` 渲染每个 pane 时调用；命中则不建 webview、直接挂本地组件。
 */
export function resolveTabViewForTab(tab: { url: string | null }): (() => Promise<Component>) | undefined {
    const view = parseExtViewTarget(tab.url)
    if (!view) return undefined
    const c = extState.tabs.find((t) => t.url === tab.url)
    return resolveTabView(view, c?.kind)
}

/**
 * 某扩展贡献项是不是「标签页视图声明」（而非可打开的 URL 标签页）。
 *
 * `registerExtTabs` 用它跳过这类贡献 —— 否则扩展一启用就会多出一个空标签页。
 * 注意 `dssh://view/` 伪链接**不是**这类声明：它是一条真实标签页，照常打开与管理。
 */
export function isTabViewContribution(tab: { view?: string }): boolean {
    return !!tab.view
}
