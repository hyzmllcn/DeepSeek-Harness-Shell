import type { BrowserShortcut, ColorSchemeId, FunLocale, NpmRegistry, NpmSource, NodeRuntimeKind, PnpmSource, ProxyProtocol, ProxyScope, SearchEngineId, Settings, Theme } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'

/** Short, friendly OS label (pure) used by the About header. */
export function friendlyPlatform(p: string | null | undefined): string {
    switch (p) {
        case 'win32':
            return 'Windows'
        case 'darwin':
            return 'macOS'
        case 'linux':
            return 'Linux'
        default:
            return p || ''
    }
}

/** Settings-form data model. Plain values inside a reactive object (no Ref-of-Ref). */
export interface SettingsState {
    workspace: string
    portMode: 'auto' | 'manual'
    manualPort: number
    dshBin: string
    timeoutMs: number
    /** 关闭窗口后继续在后台运行（隐藏到系统托盘）；关闭则直接退出。 */
    closeKeepRunning: boolean
    theme: Theme
    autoCheckUpdate: boolean
    autoCheckPrerelease: boolean
    npmRegistry: NpmRegistry
    appAutoUpdate: boolean
    appCheckPrerelease: boolean
    devMode: boolean
    /** dsh 来源：'local'（内置/默认）｜ 'global'（使用全局安装）。 */
    dshSource: 'local' | 'global'
    /** Node 运行时：'system' ｜ 'local'（默认，本地部署最新 LTS）。 */
    nodeRuntime: NodeRuntimeKind
    /** 本地安装用的 npm：'system' ｜ 'bundled'(内置) ｜ 'localnode'(本地 Node 自带)。 */
    npmSource: NpmSource
    /** dsh 插件安装用的 pnpm：'system' ｜ 'bundled'（内置，应用代管）。 */
    pnpmSource: PnpmSource
    proxyEnabled: boolean
    proxyProtocol: ProxyProtocol
    proxyHost: string
    proxyPort: number | null
    proxyScope: ProxyScope[]
    zoomPercent: number
    ignoreSystemScale: boolean
    funLocale: FunLocale
    /** 系统全局快捷键：任何程序里按下都回到主窗口（Electron accelerator，空串=禁用）。 */
    hotkeyFocusWindow: string
    /** 应用内快捷键：切换终端视图。 */
    hotkeyToggleTerminal: string
    /** 应用内快捷键：开关 DevTools（仅「开发模式」开启时生效）。 */
    hotkeyDevTools: string
    /** 内嵌 webview 是否启用硬件加速（改动需重启）。 */
    hardwareAcceleration: boolean
    /** 开机自启（「系统与性能」的「启动增强」）。 */
    autoLaunch: boolean
    /** 启动时隐藏到托盘并用系统默认浏览器打开 DSH。 */
    openDshInBrowser: boolean
    /** 内嵌页面自定义 UserAgent（空串 = 按平台/版本生成的默认）。 */
    browserUserAgent: string
    /** 地址栏非网址输入使用的默认搜索引擎。 */
    browserSearchEngine: SearchEngineId
    /** 新建标签页导航页的常用站点。 */
    browserShortcuts: BrowserShortcut[]
    /** 配色方案 id（预制方案见 lib/theme.ts）。 */
    colorScheme: ColorSchemeId
    /** 程序图标 id：'' = 内置 Logo；'diy/<文件>' 预制；'user/<文件>' 用户上传。 */
    appIcon: string
    /** 「设置 → 模型」是否已同意读取本地凭据文件。 */
    modelsCredConsent: boolean
    /** 标题栏固定标签页中被隐藏的 id 列表（空 = 全部显示）。 */
    fixedTabsHidden: string[]
    /** dsh 是否正在运行（仅 UI，不持久化）。 */
    dshRunning: boolean
    applying: boolean
    updating: boolean
    updatingDsh: boolean
    version: string | null
    versions: string[]
    versionsLoading: boolean
    switchingDsh: boolean
    uninstalling: boolean
    selectedVersion: string
}

/**
 * 外壳自身的设置动作面。
 *
 * dsh 相关动作（启停 / 版本 / 更新检查 / 卸载）**不在这里** —— 它们与「环境」「DeepSeek」
 * 两个面板放在 `views/harness/panels/`，由面板自己组装成动作面
 * （见 `panels/useHarnessActions.ts`）。设置 store 只保留与表单 / 防抖保存强耦合的动作。
 */
export interface SettingsActions {
    browseWorkspace(): Promise<void>
    browseDshBin(): Promise<void>
    apply(): Promise<void>
    resetAll(): Promise<void>
    fillFrom(s: Settings): void
}

/** `Settings` payload assembled from the current form state. */
export function payloadFrom(state: SettingsState): Settings {
    return {
        host: DEFAULT_SETTINGS.host,
        port: state.portMode === 'auto' ? null : state.manualPort > 0 ? state.manualPort : null,
        workspace: state.workspace || null,
        dshBin: state.dshBin || null,
        timeoutMs: state.timeoutMs,
        closeToTray: state.closeKeepRunning,
        theme: state.theme,
        autoCheckUpdate: state.autoCheckUpdate,
        checkPrerelease: state.autoCheckPrerelease,
        npmRegistry: state.npmRegistry,
        appAutoUpdate: state.appAutoUpdate,
        appCheckPrerelease: state.appCheckPrerelease,
        devMode: state.devMode,
        dshSource: state.dshSource,
        nodeRuntime: state.nodeRuntime,
        npmSource: state.npmSource,
        pnpmSource: state.pnpmSource,
        proxyEnabled: state.proxyEnabled,
        proxyProtocol: state.proxyProtocol,
        proxyHost: state.proxyHost,
        proxyPort: state.proxyPort,
        proxyScope: [...state.proxyScope],
        zoomPercent: state.zoomPercent,
        ignoreSystemScale: state.ignoreSystemScale,
        funLocale: state.funLocale,
        hotkeyFocusWindow: state.hotkeyFocusWindow,
        hotkeyToggleTerminal: state.hotkeyToggleTerminal,
        hotkeyDevTools: state.hotkeyDevTools,
        hardwareAcceleration: state.hardwareAcceleration,
        autoLaunch: state.autoLaunch,
        openDshInBrowser: state.openDshInBrowser,
        colorScheme: state.colorScheme,
        appIcon: state.appIcon,
        fixedTabsHidden: [...state.fixedTabsHidden],
        browserUserAgent: state.browserUserAgent,
        browserSearchEngine: state.browserSearchEngine,
        // 丢掉全空的占位行，否则会在导航页渲染出无意义的空按钮
        browserShortcuts: state.browserShortcuts
            .filter((sc) => sc.title.trim() || sc.url.trim())
            .map((sc) => ({ ...sc })),
        modelsCredConsent: state.modelsCredConsent
    }
}
