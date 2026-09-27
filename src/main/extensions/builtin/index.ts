import type { StaticExt } from '../loader/sources'
import * as xeonskyExtm from '@ext/xeonsky.extm/main'
import { manifest as xeonskyExtmManifest } from '@ext/xeonsky.extm/manifest'
import * as xeonskyHarness from '@ext/xeonsky.harness/main'
import { manifest as xeonskyHarnessManifest } from '@ext/xeonsky.harness/manifest'

/**
 * 内置扩展登记表：源码在本目录，随构建产物发布。
 *
 * 与外部扩展的区别（这也是内置这一级存在的意义）：
 *  - 随安装包发布，用户**不能卸载**（但可以停用），因此适合放「外壳自带但可选」的能力；
 *  - 经编译期检查，不存在半成品代码的风险；
 *  - 可以通过设置面板贡献里的 `view` 指定**渲染层本地组件**（外部扩展不能，见
 *    renderer/extensions/panels.ts 的说明）；
 *  - 受崩溃计数与安全模式影响（与外部扩展同等待遇）—— 它有可能是我们在这一版引入的
 *    问题，用户仍需要一条「全部关掉」的自救路径。
 *
 * 迁入一个扩展 = 写一个目录（`src/extensions/<id>/`，内含 main.ts 与 manifest.ts，可含 .vue）+ 在这里加一行。
 * 清单写在扩展自己的目录里（见 xeonsky.extm/manifest.ts 的说明），
 * 登记表只回答「有哪些内置扩展」。
 *
 * 目录在顶层 `src/extensions/` 而不是 `src/main/` 下：一个内置扩展同时有主进程与渲染层文件，
 * 而这两端分属两个构建入口（见 electron.vite.config.ts）。放在中立的顶层目录，
 * 两端都能以 `@ext/<id>/...` 引用，改一个扩展只动一个目录。
 */
export const builtinExtensions: StaticExt[] = [
    {
        // DeepSeek Harness 的界面归属：安装向导标签页（`dssh://view/harness-wizard`，
        // dsh 缺失时由外壳自动打开）+「环境」「DeepSeek」两个 top 平铺的设置面板。
        // dsh 的安装 / 启停 / 探测是内核模块（`src/main/dsh/`）—— 本扩展只持有界面，
        // 停用它只消失界面，dsh 本身照常运行。
        kind: 'builtin',
        sourceDir: 'src/extensions/xeonsky.harness',
        manifest: xeonskyHarnessManifest,
        module: xeonskyHarness
    },
    {
        // 扩展管理：设置面板（「扩展管理」页）+ 扩展包清单。
        // 7-Zip 归档核心已下沉为内核模块（`main/zip/`），加载器直接使用它；
        // 本扩展不含归档能力、也不申请系统能力，只把「有哪些扩展包」转给渲染层。
        kind: 'builtin',
        sourceDir: 'src/extensions/xeonsky.extm',
        manifest: xeonskyExtmManifest,
        module: xeonskyExtm
    }
    // 注：原第二个内置扩展 `xeonsky.browser`（webview 的 UA / 代理 / 权限策略与
    // 新标签页导航）已整体迁回内核 —— 浏览属核心通路，不该是可停用的可选件。
    // 实现见 `app/webview.ts`（会话 + 策略）与 `renderer/src/views/NewTab.vue`（导航页），
    // 浏览偏好回到内核 Settings（`browserUserAgent` 等，v8 迁移）。
]
