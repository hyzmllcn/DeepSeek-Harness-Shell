<script setup lang="ts">
import DshWizard from './DshWizard.vue'
import { dshMissing } from '../../renderer/src/shell/state'
import { activateTab, closeTab, findTab } from '../../renderer/src/shell/tabs'
import { extTabId } from '../../renderer/src/extensions/tabs'

/**
 * 「DeepSeek Harness 安装」标签页 —— `dssh://view/harness-wizard` 伪链接的本地视图
 * （由本扩展 manifest 贡献，外壳在 dsh 缺失时经 `openExtTab` 打开并激活）。
 *
 * 原「初始化页」（/setup 顶层视图）的继任者：向导不再是盖在 web 之上的覆盖层，
 * 而是**标签页模型里一条可关闭的动态标签页** —— 用户可以随时切走（去设置、去别的
 * 标签页都不会被拉回来），与原「非强制流程」语义一致，但不再占用一个顶层视图。
 *
 * ## done 语义（安装完成后去哪）
 *
 * DshWizard 发 `done` → 重新确认一次 `/dsh/installed`（与原 SetupView 相同的取舍：
 * 状态查不到时按「已就绪」处理，避免把用户弹回向导）→ 已就绪则**关掉本标签页**
 * （向导是一次性的）并切回 dsh UI（home 固定站）；仍未就绪则留在向导页。
 */
const SELF_ID = extTabId('xeonsky.harness', 'wizard')

async function done(): Promise<void> {
    try {
        dshMissing.value = !(await window.api.get('/dsh/installed'))
    } catch {
        dshMissing.value = false
    }
    if (dshMissing.value) return
    if (findTab(SELF_ID)) closeTab(SELF_ID)
    activateTab('home')
}
</script>

<template>
    <!-- relative 定位上下文：DshWizard 的根是 absolute inset:0 的遮罩，相对本容器铺满 -->
    <div class="wiz-tab">
        <DshWizard @done="done" />
    </div>
</template>

<style scoped>
.wiz-tab {
    position: relative;
    height: 100%;
}
</style>
