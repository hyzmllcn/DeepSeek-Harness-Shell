import os from 'node:os'
import { app, session, dialog, BrowserWindow } from 'electron'
import type { MessageBoxOptions, PermissionCheckHandlerHandlerDetails, WebContents } from 'electron'
import { loadSettings } from './settings'
import { proxyActive, proxyUrl } from '../dsh/net'
import { proxyConfigFor } from '../dsh/http'
import { buildSearchUrl } from '@shared/browser'
import type { ResolveResult, Settings } from '@shared/types'
import { logger } from '../kernel/logger'

/**
 * 内核侧的**内嵌浏览器模块** —— 内嵌页面（webview）的会话设置与浏览策略都从这里走。
 *
 * ## 这份实现从哪里来
 *
 * webview 功能（UA 生成、代理应用、权限策略判定、弹窗与输入解析）曾独立成内置扩展
 * `xeonsky.browser`（策略与机制分层：扩展出策略，`system.webview` 系统能力包装
 * defaultSession 出机制）。现已按「停用后会让内建功能失灵的实现该是内核模块」的判据
 * **整体迁回内核**：本文件合并了两边的全部实现，直接操作 `session.defaultSession`，
 * 不再经能力槽、不再有「扩展不可用」的降级分支 —— 外壳的整个内容区（含 dsh Web UI）
 * 本就靠 `<webview>` 渲染，浏览属核心通路，不该是可停用的可选件。
 *
 * ## 与「窗口级 webview 机制」的分工
 *
 * `webviewTag`、阻止嵌套、弹窗挂载（右键菜单 / 快捷键）、真正 `new BrowserWindow` 这些属
 * **窗口机制**，由内核建窗时决定（`app/ui.ts`）。本模块提供窗口级**纯策略**：
 * `parsePopupSize`（弹窗尺寸解析）与 `decideOpenAction`（真弹窗 vs 应用内新标签 vs 交系统），
 * 以及**输入解析**（地址栏可搜 / 导航页纯跳转），供 `app/ui.ts` 与 `modules/shell.ts` 直用。
 *
 * ## 设置存在哪
 *
 * UA / 默认搜索引擎 / 常用站点存在内核 `Settings` 里（`browserUserAgent` /
 * `browserSearchEngine` / `browserShortcuts`，见 `@shared/types`）。这里经 `loadSettings()`
 * 读取；设置保存后由 `modules/settings.ts` 调 {@link reapplyWebviewSession} 即时生效。
 *
 * ## 时机约束（别改）
 *
 * {@link initWebviewSession} 必须在 `createShellWindow()` **之前**调用 ——
 * 晚于建窗的话，先建出来的 webview 拿到的是「未装处理器 = 默认放行一切」。
 * 硬件加速不在这里：它必须早于 `app.whenReady()`，由启动流程在 ready 前读设置落地。
 */

// ---------------------------------------------------------------------------
// UserAgent 生成
// ---------------------------------------------------------------------------

/** Chromium 的 WebKit 兼容标记：真实 Chrome/Electron 一直发 537.36，与版本无关。 */
const WEBKIT_TOKEN = '537.36'

/**
 * UA 里的平台段，按各平台真实 Chrome 的写法生成：
 *  - Windows：`Windows NT 10.0; Win64; x64`（NT 版本取 `os.release()` 的主次版本）
 *  - macOS：`Macintosh; Intel Mac OS X 10_15_7` —— Chrome 自 Catalina 起就把这个串冻住了，
 *    即使 Apple Silicon 也照发，所以这里写死而不去猜 Darwin 版本到产品版本的映射
 *  - Linux：`X11; Linux x86_64` / `aarch64`
 */
function platformToken(platform: string, arch: string, osRelease: string): string {
    if (platform === 'win32') {
        const nt = /^(\d+\.\d+)/.exec(osRelease)?.[1] ?? '10.0'
        const cpu = arch === 'arm64' ? 'Win64; ARM64' : arch === 'ia32' ? 'WOW64' : 'Win64; x64'
        return `Windows NT ${nt}; ${cpu}`
    }
    if (platform === 'darwin') return 'Macintosh; Intel Mac OS X 10_15_7'
    const cpu = arch === 'arm64' ? 'aarch64' : arch === 'ia32' ? 'i686' : 'x86_64'
    return `X11; Linux ${cpu}`
}

/** 默认 UserAgent：`Mozilla/5.0 (平台) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/<Chromium> Safari/537.36 XEonSKY/<应用版本>`。 */
export function defaultUserAgent(appVersion: string): string {
    const plat = platformToken(process.platform, process.arch, os.release())
    const chrome = process.versions.chrome ?? '0.0.0.0'
    return `Mozilla/5.0 (${plat}) AppleWebKit/${WEBKIT_TOKEN} (KHTML, like Gecko) Chrome/${chrome} Safari/${WEBKIT_TOKEN} XEonSKY/${appVersion}`
}

// ---------------------------------------------------------------------------
// 权限策略
// ---------------------------------------------------------------------------

/** 三态判定：放行 / 拒绝 / 交给用户确认。 */
export type PermissionVerdict = 'grant' | 'deny' | 'ask'

/**
 * 外部站点也直接放行的权限 —— 常规浏览真正需要、且不触碰本机设备与隐私的那一批。
 *
 * 特别说明 `mediaKeySystem`：受保护内容（Netflix 等 DRM 视频）没有它直接播不了，
 * 而它拿到的是一个解密密钥句柄而非设备权限，因此归在放行档。
 */
const BROWSER_GRANTS: readonly string[] = [
    'clipboard-read',
    'clipboard-sanitized-write',
    'fullscreen',
    'keyboardLock',
    'local-fonts',
    'mediaKeySystem',
    'pointerLock',
    'speaker-selection',
    'storage-access',
    'top-level-storage-access',
    'background-sync'
]

/** 外部站点访问前必须先问用户的权限：涉及本机设备或位置，浏览器同样会弹权限条。 */
const BROWSER_ASKS: readonly string[] = ['media', 'geolocation', 'notifications', 'midi', 'midiSysex']

/** 权限对应的文案键后缀；`media` 由媒体类型细分，见 {@link permissionKindKey}。 */
const KIND_KEY: Readonly<Record<string, string>> = {
    media: 'cameraMic',
    geolocation: 'location',
    notifications: 'notifications',
    midi: 'midi',
    midiSysex: 'midi'
}

/**
 * 本机回环地址上的界面算可信来源。
 *
 * 为什么把回环整个算可信：dsh 界面本身就跑在 `127.0.0.1` 上（端口每次启动都变，不能只认
 * 某一个），用户的本地开发服务同理 —— 它们都在本机，与「桌面应用自己的界面」同一信任级。
 * 外部站点拿不到回环来源，所以这条放宽不会把外部页面变成可信。
 */
export function isTrustedRequestingUrl(value: string): boolean {
    let url: URL
    try {
        url = new URL(value)
    } catch {
        return false
    }
    // 外壳自带的页面（打包后是 file:）与自定义协议：等同应用自身。
    if (url.protocol === 'file:' || url.protocol === 'app:') return true
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host.endsWith('.localhost')
}

/** 单个权限的判定；`requestingUrl` 为空（拿不到来源）时按外部站点处理。 */
export function decidePermission(permission: string, requestingUrl: string): PermissionVerdict {
    if (requestingUrl && isTrustedRequestingUrl(requestingUrl)) return 'grant'
    if (BROWSER_GRANTS.includes(permission)) return 'grant'
    if (BROWSER_ASKS.includes(permission)) return 'ask'
    return 'deny'
}

/** `media` 按媒体类型细分（只读摄像头 / 只读麦克风 / 两者）。 */
export function permissionKindKey(permission: string, mediaTypes?: readonly string[]): string {
    if (permission === 'media' && Array.isArray(mediaTypes) && mediaTypes.length > 0) {
        const audio = mediaTypes.includes('audio')
        const video = mediaTypes.includes('video')
        if (audio && !video) return 'microphone'
        if (video && !audio) return 'camera'
    }
    return KIND_KEY[permission] ?? 'unknown'
}

/** 取来源（用于「同一来源 + 同一权限只问一次」的记忆键）；无法解析时返回空串。 */
export function originOf(requestingUrl: string): string {
    try {
        return new URL(requestingUrl).origin
    } catch {
        return ''
    }
}

/**
 * 会话级的「记住选择」：同一个来源 + 同一个权限只问一次。
 *
 * 刻意**不落盘**：一次运行内的重复请求不该反复弹窗，但「允许某站点用摄像头」不该成为永久
 * 授权 —— 重启后重新询问，与浏览器的会话级授权一致，也避免为此改设置结构（设置结构变更
 * 必须升 `settingsVersion` 并保证向后兼容）。
 */
export class PermissionMemory {
    private readonly decided = new Map<string, boolean>()

    /** 已记住的结论；没问过返回 undefined。 */
    recall(origin: string, permission: string): boolean | undefined {
        return this.decided.get(`${origin}\u0000${permission}`)
    }

    /** 记住用户的选择。 */
    remember(origin: string, permission: string, granted: boolean): void {
        this.decided.set(`${origin}\u0000${permission}`, granted)
    }

    /** 清空（调试用）。 */
    clear(): void {
        this.decided.clear()
    }
}

/**
 * 同步的「检查」路径（`navigator.permissions.query`、设备枚举等）用的判定。
 *
 * 它**不能**弹窗（回调是同步布尔），所以：直接放行的返回 true，直接拒绝的返回 false，
 * 「该问用户」的在没有记忆时先按**拒绝** —— 这样设备标签、位置状态在用户授权前不会泄露，
 * 真正的授权仍然由 request 路径（`getUserMedia` 等）触发询问。
 */
export function checkPermission(
    permission: string,
    requestingUrl: string,
    memory: PermissionMemory
): boolean {
    const verdict = decidePermission(permission, requestingUrl)
    if (verdict === 'grant') return true
    if (verdict === 'deny') return false
    return memory.recall(originOf(requestingUrl), permission) === true
}

// ---------------------------------------------------------------------------
// 窗口级纯策略：弹窗尺寸 / 开启方式
// ---------------------------------------------------------------------------

/** 弹窗尺寸夹取：非正数视为「未指定」，其余夹到 [300, 1600]。 */
function clampPopupPx(n: number): number {
    if (!Number.isFinite(n) || n <= 0) return 0
    return Math.max(300, Math.min(1600, Math.round(n)))
}

/** 从 window.open 的 features 提取宽高（默认用 900x720，越界按 clampPopupPx 收拢）。 */
export function parsePopupSize(features: string): { width: number; height: number } {
    const out = { width: 900, height: 720 }
    const mW = /(?:^|,)width=(\d+)/i.exec(features)
    const mH = /(?:^|,)height=(\d+)/i.exec(features)
    const w = mW ? clampPopupPx(Number(mW[1])) : 0
    const h = mH ? clampPopupPx(Number(mH[1])) : 0
    if (w) out.width = w
    if (h) out.height = h
    return out
}

/** 弹窗特征：带 frameName 或 features 视为真弹窗（开独立窗口），否则按普通新标签链接处理。 */
function isPopupRequest(frameName: string, features: string): boolean {
    return !!frameName || !!features
}

/**
 * 一次 webview 内 target=_blank / window.open 的处置决策。
 *
 *  - `popup`：真弹窗（带 frameName/features）→ 内核开独立窗口；
 *  - `tab`：普通链接 → 应用内新标签页；
 *  - `external`：非 http(s)（mailto: / tel: / 自定义协议等）→ 交系统默认程序处理。
 */
export function decideOpenAction(url: string, frameName: string, features: string): 'external' | 'popup' | 'tab' {
    if (!/^https?:/i.test(url)) return 'external'
    return isPopupRequest(frameName, features) ? 'popup' : 'tab'
}

// ---------------------------------------------------------------------------
// 输入解析（地址栏 / 导航页的「跳转」语义）
// ---------------------------------------------------------------------------
//
// 「用户敲的这一行是什么」属**浏览策略**，收在内核本模块：调用方只把原文递进来，
// 拿回「该加载哪个 URL」或「该交给系统」。
//
// 语义是**跳转**而非搜索：能当网址解析的一律当网址。只有当它明显不是网址时，
// 才按配置的默认搜索引擎拼一条搜索 URL —— 这一条是「地址栏」的浏览器惯例，
// 与导航页那个纯跳转的输入框是两回事（导航页直接用 {@link resolveTarget}）。

/** URL 的协议前缀（`https:` / `mailto:` …）。 */
const SCHEME_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*):/

/** 像主机名的输入（`example.com` / `www.example.com` / `a.b.c`）。 */
const HOSTNAME_RE = /^[\w-]+(\.[\w-]+)+(\/.*)?$/

/**
 * 把一行输入解析成内嵌页面可加载的 URL。
 *
 * 规则（**跳转优先**）：
 *  1. 带协议：http(s) 直接加载；其余（mailto: / tel: / 自定义）交系统；
 *  2. 形如主机名（`example.com`）→ 补 `https://`；
 *  3. 其余 → 用设置里的默认搜索引擎拼搜索 URL（浏览器的地址栏惯例）。
 *
 * @param raw 用户输入原文（未 trim）
 */
export function resolveAddressInput(raw: string): ResolveResult {
    const s = raw.trim()
    if (!s) return { kind: 'none' }
    const scheme = SCHEME_RE.exec(s)
    if (scheme) {
        const proto = scheme[1].toLowerCase()
        if (proto === 'http' || proto === 'https' || proto === 'about') return { kind: 'url', url: s }
        return { kind: 'external', url: s }
    }
    if (HOSTNAME_RE.test(s)) return { kind: 'url', url: `https://${s}` }
    return { kind: 'url', url: buildSearchUrl(loadSettings().browserSearchEngine, s) }
}

/**
 * 把一行输入解析成**纯跳转**目标（导航页的输入框用）。
 *
 * 与 {@link resolveAddressInput} 的唯一差别：不是网址就**不猜**，直接补 `https://` 当作域名
 * 去试 —— 导航页的输入框是「跳转」，不做搜索。
 */
export function resolveTarget(raw: string): ResolveResult {
    const s = raw.trim()
    if (!s) return { kind: 'none' }
    const scheme = SCHEME_RE.exec(s)
    if (scheme) {
        const proto = scheme[1].toLowerCase()
        if (proto === 'http' || proto === 'https' || proto === 'about') return { kind: 'url', url: s }
        return { kind: 'external', url: s }
    }
    return { kind: 'url', url: `https://${s}` }
}

// ---------------------------------------------------------------------------
// 会话应用（UA / 代理 / 权限处理器，作用于 session.defaultSession）
// ---------------------------------------------------------------------------

/** 已应用的 UA（幂等：值没变就不重复设置）。 */
let appliedUa = ''

/** 已应用的代理 URL；null = 从未显式设置（沿用系统代理），undefined = 未初始化。 */
let appliedProxy: string | null | undefined = undefined

/**
 * 把 UserAgent 应用到 defaultSession（幂等）。
 *
 * **必须在 `app.whenReady()` 之后调用**（ready 前拿不到 defaultSession），
 * 且要在建窗之前 —— 这样 webContents 一创建拿到的就是它。
 *
 * @returns 是否实际写入了会话（幂等命中时 false）。
 */
function setUserAgent(ua: string): boolean {
    if (ua === appliedUa) return false
    try {
        session.defaultSession.setUserAgent(ua)
        appliedUa = ua
        return true
    } catch {
        // ready 之前调用会抛：不更新缓存，调用方可在 ready 后重试。
        return false
    }
}

/**
 * 按当前设置里的「程序本体」代理范围，把代理应用到 defaultSession。
 *
 * 未启用代理时**不调用 setProxy**，保留 Electron 默认的「跟随系统代理」；
 * 只有从「有」变「无」时才显式回落 system。返回 Promise 是因为 `setProxy`
 * 异步生效，建窗 / 保存设置时应当 await，否则第一批请求仍按旧配置发出。
 *
 * @returns 实际生效的代理 URL（null = 系统代理）。
 */
async function applyProxy(): Promise<string | null> {
    const cfg = loadSettings()
    const url = proxyActive(cfg, 'app') ? proxyUrl(cfg) : null
    if (appliedProxy === url) return url
    appliedProxy = url
    try {
        await session.defaultSession.setProxy(proxyConfigFor(url))
        return url
    } catch {
        // ready 之前调用会抛：撤销登记，调用方可在 ready 后重试。
        appliedProxy = undefined
        throw new Error('applyProxy failed (session not ready?)')
    }
}

/** 权限检查回调：给定权限与来源，返回是否放行（同步）。 */
type PermissionCheck = (
    permission: string,
    requestingOrigin: string,
    details?: PermissionCheckHandlerHandlerDetails
) => boolean

/** 权限请求回调：给定权限与请求详情，异步返回是否放行。 */
type PermissionRequest = (
    permission: string,
    requestingUrl: string,
    mediaTypes: readonly string[] | undefined
) => Promise<boolean>

/**
 * 给 defaultSession 装上四个权限处理器。
 *
 * **四个缺一不可**：`request` 管主动请求（getUserMedia 等），`check` 管同步查询
 * （navigator.permissions.query、设备枚举），`device` 管 HID / 串口 / USB
 * （**不走 request**），`displayMedia` 管屏幕共享。只装 request 会被后三条绕过。
 * `onRequest` 为空时按「一律拒绝」装（保守兜底，绝不出现「没回调 = 默认放行」）。
 */
function installPermissionHandlers(check: PermissionCheck, onRequest?: PermissionRequest): void {
    const s = session.defaultSession
    // 设备类（HID / 串口 / USB）一律不给：内嵌页面是任意站点，接硬件属于最不该开放的一类。
    s.setDevicePermissionHandler(() => false)
    // 屏幕共享一律不给：同样理由，录制桌面比接硬件更敏感。
    s.setDisplayMediaRequestHandler((_request, callback) => callback({}))
    s.setPermissionCheckHandler((_contents, permission, requestingOrigin, details) =>
        check(permission, requestingOrigin, details)
    )
    s.setPermissionRequestHandler((_contents, permission, callback, details) => {
        const url = typeof details?.requestingUrl === 'string' ? details.requestingUrl : ''
        const mediaTypes = details && 'mediaTypes' in details ? details.mediaTypes : undefined
        if (!onRequest) {
            callback(false)
            return
        }
        void onRequest(permission, url, mediaTypes).then(
            (granted) => callback(granted),
            () => callback(false)
        )
    })
}

/** 当前生效的 UA：设置里的自定义优先，留空用按平台/版本生成的默认。 */
function effectiveUserAgent(): string {
    const custom = (loadSettings().browserUserAgent || '').trim()
    return custom || defaultUserAgent(app.getVersion())
}

// ---------------------------------------------------------------------------
// 权限询问（系统对话框）
// ---------------------------------------------------------------------------

/** 会话级「记住选择」：同一来源 + 同一权限只问一次（重启后重新询问，不落盘）。 */
const permissionMemory = new PermissionMemory()

/** 权限询问串行化：多个站点同时请求时不该叠出一堆系统弹窗。 */
let promptQueue: Promise<unknown> = Promise.resolve()

function queuePrompt(task: () => Promise<boolean>): Promise<boolean> {
    const next = promptQueue.then(task, task)
    promptQueue = next.catch(() => undefined)
    return next
}

/**
 * 权限文案：`<来源> 想使用 <权限>`。
 *
 * 内联英文而不是走外壳 i18n：权限弹窗是**系统级对话框**（`dialog.showMessageBox`），
 * 由主进程直接构造，不经过渲染层的 i18n 运行时，而设置结构里并没有
 * 「该用哪种语言」的信息。
 */
function permissionLabel(permission: string, mediaTypes?: readonly string[]): string {
    const kind = permissionKindKey(permission, mediaTypes)
    const labels: Record<string, string> = {
        cameraMic: 'camera and microphone',
        camera: 'camera',
        microphone: 'microphone',
        location: 'your location',
        notifications: 'notifications',
        midi: 'MIDI devices',
        unknown: 'this permission'
    }
    return labels[kind] ?? labels.unknown
}

/** 弹系统询问框问用户；拿不到宿主窗口时用无父窗口的对话框。弹不出来按拒绝。 */
async function askPermission(
    contents: WebContents | null,
    permission: string,
    requestingUrl: string,
    mediaTypes: readonly string[] | undefined,
    appTitle: string
): Promise<boolean> {
    const options: MessageBoxOptions = {
        type: 'question',
        title: appTitle,
        message: `${originOf(requestingUrl)} wants to use ${permissionLabel(permission, mediaTypes)}`,
        detail: requestingUrl,
        buttons: ['Allow', 'Deny'],
        defaultId: 1,
        cancelId: 1,
        noLink: true
    }
    const parent = contents ? BrowserWindow.fromWebContents(contents) : null
    try {
        const { response } = parent && !parent.isDestroyed()
            ? await dialog.showMessageBox(parent, options)
            : await dialog.showMessageBox(options)
        return response === 0
    } catch {
        return false
    }
}

/** 同步检查回调（`navigator.permissions.query` / 设备枚举）。 */
function check(permission: string, requestingOrigin: string): boolean {
    return checkPermission(permission, requestingOrigin, permissionMemory)
}

/** 异步请求回调（`getUserMedia` 等会真正弹窗的那条路径）。 */
function onRequest(appTitle: string): PermissionRequest {
    return (permission, url, mediaTypes) => {
        const verdict = decidePermission(permission, url)
        if (verdict === 'grant') return Promise.resolve(true)
        if (verdict === 'deny') return Promise.resolve(false)
        const origin = originOf(url)
        const remembered = permissionMemory.recall(origin, permission)
        if (remembered !== undefined) return Promise.resolve(remembered)
        return queuePrompt(async () => {
            // 权限询问按「无父窗口」路径弹（请求回调里拿宿主窗口的意义有限：
            // 多窗口下弹给发起窗口更自然，但询问被串行化后宿主可能已销毁）。
            const granted = await askPermission(null, permission, url, mediaTypes, appTitle)
            permissionMemory.remember(origin, permission, granted)
            return granted
        })
    }
}

// ---------------------------------------------------------------------------
// 对外入口
// ---------------------------------------------------------------------------

/**
 * 重新应用会话设置（UA + 代理）。
 *
 * 由设置模块在保存 / 重置后调用：设置里任何影响会话的项（`browserUserAgent`、
 * 代理范围与开关）变化后都走这里。UA / 代理各自幂等（值没变不重复设置），
 * 失败只打日志不影响设置保存。
 */
export async function reapplyWebviewSession(): Promise<void> {
    const log = logger('[Webview]')
    try {
        setUserAgent(effectiveUserAgent())
    } catch (err) {
        log.warn({ err }, 'setUserAgent failed')
    }
    try {
        await applyProxy()
    } catch (err) {
        log.warn({ err }, 'applyProxy failed')
    }
}

/**
 * 把内嵌页面的会话设置（UA / 代理 / 权限策略）落地。
 *
 * 必须在 `createShellWindow()` 之前调用（权限处理器要在建窗前装好，否则先建出来的
 * webview 拿到「未装处理器 = 默认放行一切」的策略）。失败只降级为打日志，不阻断启动。
 *
 * @param cfg 当前设置（UA 取 `browserUserAgent`；代理由 {@link applyProxy} 自行读取）
 * @param log 调用方的 logger（沿用其 tag，便于日志归口）
 */
export async function initWebviewSession(cfg: Settings, log: ReturnType<typeof logger>): Promise<void> {
    void cfg
    const ua = effectiveUserAgent()
    try {
        setUserAgent(ua)
    } catch (err) {
        log.warn({ err }, 'setUserAgent failed')
    }
    let proxy: string | null = null
    try {
        proxy = await applyProxy()
    } catch (err) {
        log.warn({ err }, 'applyProxy failed')
    }
    try {
        installPermissionHandlers(check, onRequest(app.getName()))
    } catch (err) {
        log.warn({ err }, 'installPermissionHandlers failed')
    }
    log.info({ ua, proxy: proxy ?? 'system' }, 'webview session configured')
}
