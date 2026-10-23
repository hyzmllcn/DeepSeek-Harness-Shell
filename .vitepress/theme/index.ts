import { h } from 'vue'
import DefaultTheme from 'vitepress/theme'
import MaintenanceBanner from './MaintenanceBanner.vue'
import './custom.css'

// 在默认主题之上补充顶部维护状态横幅与少量首页 / 卡片样式（不改变默认主题行为）。
export default {
    extends: DefaultTheme,
    Layout: () => h(DefaultTheme.Layout, null, {
        'layout-top': () => h(MaintenanceBanner)
    })
}
