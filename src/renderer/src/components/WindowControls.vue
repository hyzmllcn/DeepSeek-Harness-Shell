<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { CloseOutlined, FullscreenExitOutlined, FullscreenOutlined, MinusOutlined } from '@antdv-next/icons'
import { WIN_GLYPH, WIN_GLYPH_STACK, winGlyphsAvailable } from '../lib/winicons'

/**
 * 窗口控制按钮组：最小化 / 最大化-还原 / 关闭（Chrome 同款全高按钮，样式见 shared.css 的 .wbtn）。
 *
 * 全仓只有标题栏（TitleBar）一个使用方：设置 / 刷新按钮已并入同一按钮组，关闭钮贴窗口右上角。
 * （旧注释称安装向导也挂这份按钮 —— 已过时：向导渲染在标题栏下方的 overlay 里，不遮挡标题栏。）
 *
 * ⚠️ 最大化状态**必须订阅主进程事件**，不能各自记状态：双击拖动区、系统快捷键、Aero Snap
 * 同样会改变最大化状态，每个实例各写一份迟早会与真实状态脱节（表现为图标和窗口对不上）。
 * 因此这里不用单例、不共享状态；即便未来多处挂载，也各自订阅同一事件源。
 *
 * 无 props / 无 emits：按钮行为只走 IPC。
 */

const winMinimize = (): void => void window.api.post('/windows/minimize')
const winMaximize = (): void => void window.api.post('/windows/maximize-toggle')
const winClose = (): void => void window.api.post('/windows/close')

/**
 * Windows 下改用系统自带的窗口控制字形（Segoe Fluent Icons → Segoe MDL2 Assets → Segoe UI Symbol），
 * 与系统原生标题栏一致；字体或字形不可用时保留 antdv 的矢量图标（见 lib/winicons.ts）。
 */
const useWinGlyphs = winGlyphsAvailable()

const maximized = ref(false)
let offMaximized: (() => void) | null = null

/** 第二个按钮的字形：最大化 / 还原。 */
const maxRestoreGlyph = computed(() => (maximized.value ? WIN_GLYPH.restore : WIN_GLYPH.maximize))

/**
 * 字形字体栈以**内联样式**注入，而不是写死在 CSS 里：字体顺序与可用性探测（lib/winicons.ts）
 * 必须永远是同一份，写两处迟早会走偏。
 */
const glyphStyle = { fontFamily: WIN_GLYPH_STACK }

onMounted(async () => {
    try {
        maximized.value = await window.api.get('/windows/maximized')
    } catch {
    /* 取不到就按未最大化渲染 */
    }
    offMaximized = window.api.on('win:maximized', (v) => {
        maximized.value = v
    })
})

onBeforeUnmount(() => {
    offMaximized?.()
})
</script>

<template>
    <div class="window-controls">
        <el-tooltip :content="$t('app.minimize')" placement="bottom" :show-after="300">
            <button class="wbtn" type="button" @click="winMinimize">
                <span v-if="useWinGlyphs" class="wglyph" :style="glyphStyle" aria-hidden="true">{{ WIN_GLYPH.minimize }}</span>
                <el-icon v-else><MinusOutlined /></el-icon>
            </button>
        </el-tooltip>
        <el-tooltip :content="maximized ? $t('app.restore') : $t('app.maximize')" placement="bottom" :show-after="300">
            <button class="wbtn" type="button" @click="winMaximize">
                <span v-if="useWinGlyphs" class="wglyph" :style="glyphStyle" aria-hidden="true">{{ maxRestoreGlyph }}</span>
                <el-icon v-else><component :is="maximized ? FullscreenExitOutlined : FullscreenOutlined" /></el-icon>
            </button>
        </el-tooltip>
        <el-tooltip :content="$t('app.closeHint')" placement="bottom" :show-after="300">
            <button class="wbtn danger" type="button" @click="winClose">
                <span v-if="useWinGlyphs" class="wglyph" :style="glyphStyle" aria-hidden="true">{{ WIN_GLYPH.close }}</span>
                <el-icon v-else><CloseOutlined /></el-icon>
            </button>
        </el-tooltip>
    </div>
</template>

<style scoped>
.window-controls {
    display: flex;
    align-items: stretch; /* 按钮通高：与右侧按钮组（设置/刷新）连成一条 Chrome 式全高按钮带 */
}
/* 按钮可点不可拖：标题栏是拖动区，按钮之间的空隙仍可拖窗口。 */
.window-controls .wbtn {
    -webkit-app-region: no-drag;
}
</style>
