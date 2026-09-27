import type { SettingsActions, SettingsState } from '../../../renderer/src/views/settings/settingsStore'
import { useSettingsStore } from '../../../renderer/src/views/settings/useSettingsStore'
import { createDshActions, type DshActions } from './actions/dshActions'
import { createDshManageActions, type DshManageActions } from './actions/dshManageActions'

/**
 * 「环境」「DeepSeek」两个面板消费的动作面 = **外壳设置动作 + dsh 动作**。
 *
 * ## 为什么在这边组装，而不是留在 useSettingsStore
 *
 * dsh 那组动作的实现已随两个面板一起搬进本扩展（`panels/actions/`）。外壳**不能**反向
 * import 扩展的实现：那等于让「停用本扩展」抽掉设置页的一部分代码，也破坏了
 * 「内核自洽、扩展只是界面」的分界。所以由扩展自己把内核动作（store 提供的
 * apply / browseDshBin / fillFrom 等）与自己的 dsh 动作拼成一个对象交给面板 ——
 * 依赖方向是 **扩展 → 外壳**，正确的那一边。
 *
 * 状态仍是**同一份** store state：面板只是视图，字段照旧经 store 读写内核 Settings，
 * 这里只借它做动作的闭包参数。
 */
export type HarnessActions = SettingsActions & DshActions & DshManageActions

export function useHarnessActions(): { state: SettingsState; actions: HarnessActions } {
    const store = useSettingsStore()
    const actions: HarnessActions = {
        ...store.actions,
        ...createDshActions(store.state),
        ...createDshManageActions(store.state)
    }
    return { state: store.state, actions }
}
