import { reactive } from 'vue'

/**
 * 标题栏固定标签页「显示 / 隐藏」偏好的渲染层镜像（单例）。
 *
 * 权威存储是内核设置 `Settings.fixedTabsHidden`（被隐藏的标签页 id 列表）。
 * 这里只做「启动读一份 + 订阅 `settings:changed` 回放」的**只读镜像**，
 * 供标题栏（过滤左侧图标）与设置页外观面板（显示开关）共同消费 ——
 * 两处读同一份，避免各自 GET 一份出现漂移。写入走设置页的常规管线
 * （Pinia store 的自动保存 + 主进程广播回放），本模块不落盘。
 */
export const fixedTabsPref = reactive<{ hidden: string[] }>({ hidden: [] })

/** 某固定标签页是否被隐藏（未隐藏 = 显示在标题栏左侧）。 */
export function isFixedTabHidden(id: string): boolean {
    return fixedTabsPref.hidden.includes(id)
}

let started = false

/** 拉取一次设置并订阅回放（幂等；外壳标题栏挂载时调用一次即可）。 */
export function initFixedTabsPref(): void {
    if (started) return
    started = true
    void window.api
        .get('/settings')
        .then((s) => {
            fixedTabsPref.hidden = Array.isArray(s.fixedTabsHidden) ? [...s.fixedTabsHidden] : []
        })
        .catch(() => {
            /* 读不到就按「全部显示」渲染，等下一次回放修正 */
        })
    // 主进程落盘后的权威回放：设置页里切换开关后标题栏即时跟随。
    window.api.on('settings:changed', (s) => {
        fixedTabsPref.hidden = Array.isArray(s.fixedTabsHidden) ? [...s.fixedTabsHidden] : []
    })
}
