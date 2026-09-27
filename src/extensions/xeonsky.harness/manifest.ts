import type { ExtManifest } from '@shared/extensions'

/**
 * 内置扩展 `xeonsky.harness` —— DeepSeek Harness 的**界面归属**。
 *
 * 它贡献三样东西（实现都在本目录与 `panels/`）：
 *
 *  1. **安装向导标签页**：`dssh://view/harness-wizard` 伪链接标签页 —— dsh 未安装 /
 *     未初始化时由外壳自动打开（App.vue 监听 dshMissing），向导（DshWizard.vue）
 *     就地显示；装完自动关掉该标签页并回到 dsh UI。初始化不再是独立的顶层视图。
 *  2. **「环境」面板**（key `env`）：Node / npm / pnpm 来源（EnvPanel.vue）。
 *  3. **「DeepSeek」面板**（key `dsh`）：dsh 来源、更新、令牌与余额（DshPanel.vue）。
 *
 * 两个面板用 `top: true` 平铺在设置侧栏一级（它们原是内置面板，侧栏结构不变）；
 * titleKey 直接引用全局键 `sv.nav.*`（内置扩展与外壳同一张文案表，无需复制文案）。
 *
 * ## 职责边界（为什么 dsh 的「能力」不在本扩展）
 *
 * dsh 的安装 / 启停 / 探测全部是**内核模块**（`src/main/dsh/` + `modules/dsh.ts`）——
 * 那是「停用扩展会让内建功能失灵」的实现，按既定判据必须留内核；本扩展只持有
 * **界面**。停用本扩展 = 向导与环境 / DeepSeek 面板消失（可从扩展页重新启用），
 * dsh 本身照常运行。设置**字段**也仍在内核 `Settings`（面板只是视图，经
 * useSettingsStore 读写同一份状态）。
 */
export const manifest: ExtManifest = {
    id: 'xeonsky.harness',
    name: 'DeepSeek Harness',
    version: '1.0.0',
    apiVersion: 1,
    capabilities: [],
    contributions: {
        tabs: [
            {
                key: 'wizard',
                titleKey: 'ext.xeonskyHarness.tabTitle',
                // 内置伪链接：渲染层按 `dssh://view/<名>` 挂载本地视图（见 tabviews.ts），
                // 不进 webview。openOnStart 不开 —— 只由外壳在 dsh 缺失时打开。
                url: 'dssh://view/harness-wizard'
            }
        ],
        settings: [
            { key: 'env', titleKey: 'sv.nav.env', view: 'harnessEnv', icon: 'env', top: true },
            { key: 'dsh', titleKey: 'sv.nav.dsh', view: 'harnessDsh', icon: 'dsh', top: true }
        ]
    }
}
