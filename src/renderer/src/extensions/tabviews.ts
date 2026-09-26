import type { Component } from 'vue'

/**
 * 渲染层控制点 1 的**视图侧**：程序内置标签页视图。
 *
 * ## 这是什么
 *
 * 标签页控制点原先只能贡献「一个 URL」—— 外壳把它当普通动态标签页打开
 * （见 `tabs.ts`）。但有一类标签页**天然不该是网页**：它们的内容是程序自己的界面。
 * 贡献项带 `view`（视图名）时，外壳按名字到 {@link LOCAL_TAB_VIEWS} 查本文件登记的实现。
 * 规则与设置面板的 `LOCAL_VIEWS` 完全一致 —— **只有内置 / 系统扩展能解析**
 * （外部扩展若能注入组件，就等于在外壳的 DOM 与 JS 上下文里执行任意代码）。
 *
 * ## 与 URL 型标签页的区别
 *
 * 带 `view` 的贡献**不会**被 `registerExtTabs` 打开成标签页 —— 它只是一条
 * 「视图注册声明」。
 *
 * ## 现状
 *
 * 内核自己的「新建标签页」导航页**不经**此机制（它是内核视图 `views/NewTab.vue`，
 * 由 `WebHost.vue` 按 `kind === 'newtab'` 直挂）。本表当前为空，
 * 这条通路保留给内置 / 系统扩展贡献的内置页面。
 */

/**
 * 外壳登记的标签页视图实现：`view` 名 → 组件。
 *
 * 只放**内置 / 系统**扩展的实现（随构建进包）；外部扩展即使声明了同名 view
 * 也拿不到这里的组件（{@link resolveTabView} 会按 kind 判定）。
 */
const LOCAL_TAB_VIEWS: Record<string, () => Promise<Component>> = {}

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
 * 某扩展贡献项是不是「标签页视图声明」（而非可打开的 URL 标签页）。
 *
 * `registerExtTabs` 用它跳过这类贡献 —— 否则扩展一启用就会多出一个空标签页。
 */
export function isTabViewContribution(tab: { view?: string }): boolean {
    return !!tab.view
}
