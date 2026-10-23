/**
 * 跨端（main + renderer）共用的版本号工具。
 *
 * 这里刻意**不依赖 `semver` 包**：renderer 侧只做轻量判断，引入 semver 会白白增大渲染层产物。
 * 主进程的 `main/semver.ts` 复用本函数，从而保证「是否预发布」在两端判断一致
 * （此前 main 用 semver.prerelease、renderer 用正则，遇到带前导 v 的版本号会得出不同结论）。
 */

/** 去掉前导 v/V（GitHub Release tag 常见）。 */
export function stripV(v: string): string {
    return v.replace(/^[vV]/, '')
}

/** 是否预发布版本（含 rc / beta / alpha / 数字预发布段）。 */
export function isPrerelease(v: string): boolean {
    return /^\d+\.\d+\.\d+-/.test(stripV(v))
}

/**
 * 统一补上 `v` 前缀供界面展示：`process.versions.node` 不带 v，`node --version` 带，
 * 同一列里混着两种写法很难看；空值统一显示占位符。
 *
 * 此前 DshPanel / EnvPanel 各写了一份（其中一份还用了模板字符串），展示层合并为一处。
 */
export function withV(v: string | null | undefined, placeholder = '—'): string {
    if (!v) return placeholder
    return /^[vV]/.test(v) ? v : `v${v}`
}

/**
 * dsh 可用的 Node 最低版本 —— 与上游 engines `^22.19.0 || >=24.0.0` 对齐（23 不在支持范围）。
 * 22.19 之前的 22.x 缺少 dsh 依赖的 API。
 */
export const MIN_NODE_VERSION = '22.19'

/** Node 版本是否满足 dsh 的运行要求：22.19+ 的 22.x，或 24+；23.x 不支持。 */
export function isSupportedNode(v: string | null | undefined): boolean {
    if (!v) return false
    const m = /^v?(\d+)(?:\.(\d+))?/.exec(v.trim())
    if (!m) return false
    const major = parseInt(m[1], 10)
    const minor = m[2] ? parseInt(m[2], 10) : 0
    if (major === 22) return minor >= 19
    return major >= 24
}
