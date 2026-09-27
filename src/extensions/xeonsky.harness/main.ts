/**
 * 内置扩展 `xeonsky.harness` —— DeepSeek Harness 的界面归属（安装向导标签页 +
 * 「环境」「DeepSeek」两个设置面板）。
 *
 * 本扩展**没有主进程逻辑**：dsh 的安装 / 启停 / 探测是内核模块（`src/main/dsh/`），
 * 向导与面板都是纯渲染层界面，经 `window.api`（= extApi）调既有内核端点。
 * 主进程入口是扩展清单的必备项，故保留这个最小的 activate —— 它只留一条日志，
 * 便于在加载日志里确认本扩展已激活。
 *
 * 目录结构：
 *  - `manifest.ts` —— 贡献点声明（向导标签页 + 两个 top 面板）；
 *  - `DshWizard.vue` / `WizardSteps.vue` / `wizard/` —— 安装向导全家桶；
 *  - `WizardTab.vue` —— 向导标签页薄壳（done 后关自身标签页并回 dsh UI）；
 *  - `panels/` —— 「环境」「DeepSeek」面板及其组合式与动作模块；
 *  - `locales.ts` —— 本扩展自备的少量文案（标签页标题）。
 */
import type { ExtContext } from '@main/extensions/loader/ctx'

export function activate(ctx: ExtContext): void {
    ctx.log.info('builtin extension xeonsky.harness activated (wizard tab + "env"/"dsh" panels)')
}
