import type { ExtensionLocaleTable } from '@shared/locales/ext'

/**
 * 内置扩展 `xeonsky.harness` 的**自有语言文件**。
 *
 * 键统一挂在 `ext.xeonskyHarness.*` 命名空间下，由渲染层扩展框架在启动时合并进
 * 文案目录（机制见 `shared/locales/ext.ts` 与 `renderer/src/extensions/locales.ts`）。
 *
 * 本扩展只有少量自有键（标签页标题）——向导与面板的正文沿用**全局**文案表
 * （`wizard.*` / `sv.*` 等）：它们是从外壳视图整体迁来的内置实现，与外壳共用
 * 同一张表即可（外部扩展才必须自备全部文案）。
 */
export const extLocales: ExtensionLocaleTable = {
    zh: {
        ext: {
            xeonskyHarness: {
                tabTitle: 'DeepSeek Harness 安装'
            }
        }
    },
    en: {
        ext: {
            xeonskyHarness: {
                tabTitle: 'DeepSeek Harness setup'
            }
        }
    }
}
