# 架构、启动与数据位置

> 本页是 `docs/zh/dev/architecture.md`、`config-dir.md` 的「AI 可执行版」；冲突时以源码为准。

## 三个进程

| 进程 | 目录 | 职责 | 边界 |
|---|---|---|---|
| 主进程 main | `src/main/` | 窗口 / 托盘、设置、启动守护 dsh、下载安装、自更新、IPC 路由 | 唯一可直接用 Electron 主进程 API 的层。**内部按微内核分层**：`kernel/`（机制）+ `modules/`（功能模块）+ `app/`+`dsh/`（实现），见 references/main-process.md |
| 预加载 preload | `src/preload/` | `contextBridge` 暴露 `window.api` | 唯一碰 `ipcRenderer` 的文件 |
| 渲染进程 renderer | `src/renderer/` | Vue 3 界面：标签页外壳、设置、向导、终端 | 只能通过 `window.api` 调主进程 |

共享代码（类型、i18n、版本工具）在 `src/shared/`，三边都能 import；别名 `@shared` 指向它，`@` 指向 `src/renderer/src`（见 `electron.vite.config.ts`）。

## 主进程分层：微内核

主进程内部是**小内核 + 可插拔模块**：

```text
kernel/   稳定机制，不认识业务名词
modules/  功能策略，一个功能一个文件，自己声明路由（defineModule）
app/ dsh/ 具体实现，被 modules 调用
```

- **依赖是单向的**：`modules → kernel`、`modules → app/dsh`；**模块之间不 import**。
  模块 A 要触发模块 B 的动作时走 **kernel 服务槽**（`provideService` / `useService`）——
  例：`modules/settings` 的 `POST /settings/apply` 需要重启 dsh，就 `useService(SERVICE.RESTART_DSH)`，
  而 `RESTART_DSH` 由 `modules/dsh` 在 `onReady` 时注册。这样打断 `settings → dsh/dsh → app/settings` 的静态环。
- **契约仍在编译期**：模块声明的路径必须是 `@shared/api` 的 `ApiRoutes` 里登记过的
  `"<METHOD> <path>"`，写错路径或返回值对不上直接报错；`ModuleRegistry` 还会对重复路由**启动即抛错**。
- `app/ipc.ts` 退化成**装配器**（~50 行）：建 Router + `new ModuleRegistry(allModules())` + `mountRoutes`，
  并暴露 `registerIpc` / `runModuleReady` / `runModuleQuit`。端点实现全在 `modules/*.ts`。
- 详见 references/main-process.md 与 references/ipc.md。

## 扩展机制已移除

本项目不再有扩展框架：没有外部扩展目录、加载器、系统能力槽、扩展管理页或 `@ext` 别名。
原内置扩展的界面已并入核心：

```text
src/renderer/src/views/harness/   安装向导 + 「环境」「DeepSeek」设置面板
  DshWizard.vue / WizardTab.vue / WizardSteps.vue / wizard/   向导与各步骤组合式
  panels/                         EnvPanel / DshPanel 及其组合式与动作
```

- 设置页路由：`settings-env` / `settings-dsh`（`shell/router.ts`），侧栏由 `SettingsView.vue` 直接登记；
- 安装向导是内核标签页：`shell/tabs.ts` 的 `openWizardTab()` 打开 `dssh://view/harness-wizard`，
  `WebHost.vue` 直接挂载 `WizardTab.vue`，`useWebviews.ts` 不为它建 webview；
- dsh 的安装 / 启停 / 探测仍是主进程内核模块（`src/main/dsh/`、`modules/dsh.ts`、`modules/env.ts`）。

**硬件加速**：只在 ready 前读 `settings.hardwareAcceleration === false` 并调用
`app.disableHardwareAcceleration()`（`src/main/index.ts`），不再有扩展 `preReady` 申报。

**下载能力是内核模块 `src/main/download/`**（原先是内置扩展 `xeonsky.download`，已下沉）：
`engine.ts`（分段 / 跨会话断点续传 / 令牌桶限速 / 重试 / 大小校验）+ `index.ts`
（任务队列、状态机、`<配置目录>/data/download/tasks.json` 持久化）。引擎直接调
`dsh/http.ts` 的 `httpFetch` 发请求（代理按 scope 生效），「设置 → 网络 → 代理」照常生效。
断点续传靠 `.part` 旁的 `.part.json` 侧车（记录 total / etag / lastModified / 各段偏移），
三者任一变化就整份重下（避免拼出「前半旧后半新」）。内核调用方（Node 发行包、内置
npm / pnpm）走**门面** `dsh/download.ts` 的 `downloadFile()`（同目标并发去重，后到者
订阅同一份进度）。端点面在 `modules/download.ts`（`GET /download` 等，契约在
`shared/api.ts` + `shared/download.ts`），进度经 `download:progress` 事件推送，
界面是设置页的「下载」面板（`views/settings/DownloadPanel.vue`）；
退出时模块 `onQuit` 调 `shutdownDownloads()` 把在跑任务落成 paused（可续传）。

## 启动顺序（`src/main/index.ts`）

1. **dev / release 隔离**：开发态把 `userData` 指向 `"<app> (dev)"`，避免与已安装版抢单实例锁。
2. `ensureDefaultConfigMigration()`：登记配置目录迁移，**必须在任何读设置之前**。
3. 读取启动所需设置（忽略系统缩放、硬件加速）。
4. **单实例锁**：拿不到锁直接退出；第二次启动把已有窗口置前。
5. `app ready` 后：`registerIpc()` + `runModuleReady()`（装配模块、跑模块的 `onReady`）→ 建窗 → 建托盘 → 注册全局快捷键。
6. `await waitForConfigMigration()`：有待迁移先搬完（带进度广播）再继续。
7. `await migrateLegacyInstalls()`：旧平铺安装目录迁成版本化布局。
8. 启动配置文件监听；dsh 已存在则 `restart()` 启动。
9. 按设置检查应用更新。

**改动启动逻辑时注意**：步骤 2 与 6 的顺序是配置目录可读性的前提，不要调换。

## 生命周期与退出

- **关闭窗口**：默认隐藏到托盘（设置可改为直接退出）；**关闭窗口不结束 dsh**。
- **真正退出**：`before-quit` 先 `preventDefault()` → 异步 `stopDshGracefully()` → 清理其余子进程 →
  `runModuleQuit()`（模块 `onQuit` 逆序）→ 二次放行 `app.quit()`。
- **兜底**：`process.on('exit')` 再杀一次 server 与子进程，避免孤儿进程。

## 窗口与标签

- 核心窗口承载三个固定站（dsh Web UI / 网页对话 / 用量充值）；核心窗口登记与接管见 `src/main/app/windowreg.ts` 与渲染层 `src/renderer/src/shell/tabs.ts`。
- 副窗口由「在新窗口打开」创建，标签可拖入 / 拖出；核心窗口关闭后由最早的副窗口接管。
- 内嵌页面用 `<webview>`；地址栏只在动态标签显示，协议 / 搜索分流在渲染层。
- **内嵌页面里跑的是任意站点**，所以 `defaultSession` 上装了一层权限策略 —— 实现在 `src/main/app/webview.ts`（`decidePermission` / `isTrustedRequestingUrl` / `PermissionMemory` / `checkPermission`）。判定规则：本机回环 / `file:` 的界面（含 dsh 自己的 `127.0.0.1`，它的实验性语音输入要用麦克风）放行；外部站点只放行常规浏览所需，设备与隐私类弹系统询问，其余拒绝；HID / 串口 / USB 与屏幕共享另行单独关掉。**放宽任何一档之前先想清「这是把一个能力交给任意网页」。**
- 会话的 UA / 代理 / 权限处理器都由 `app/webview.ts` 直接落地，不经能力槽。硬件加速必须早于 `app.whenReady()`，由 `src/main/index.ts` 直接按 `settings.hardwareAcceleration` 决定。
- **窗口级 webview 机制在内核 `app/ui.ts`**：`webviewTag: true`、`did-attach-webview`（挂右键菜单 / 快捷键）、`will-attach-webview`（阻止嵌套）、`openWebWindow` / `createPopupWindow`。外壳**整个内容区（含 dsh Web UI 固定站）都靠 `<webview>` 渲染**（`renderer/views/WebHost.vue` → `useWebviews`），属核心通路。弹窗尺寸解析与「真弹窗 vs 应用内新标签 vs 系统浏览器」判定同样在 `app/webview.ts`，内核直接调用。
- **打开外部链接只有一个出口**：`src/main/app/openlink.ts` 的 `openExternalSafe(url)`（协议白名单 `http/https/mailto/tel/sms`）。内嵌页面里跑的是任意站点，`window.open('file:...')` 之类会拉起系统处理程序，所以**不要**在别处直接调 `shell.openExternal`；被拒时只 warn 不抛。
- **新建标签页 = 程序内置标签页导航**（不是 webview）：`views/NewTab.vue`，`WebHost.vue` 按 `kind === 'newtab'` 直挂。安装向导是另一条本地视图：URL 为 `dssh://view/harness-wizard`，`shell/tabs.ts` 的 `openWizardTab()` 打开，`WebHost.vue` 直接挂 `WizardTab.vue`，不建 webview。
- **地址栏 / 导航页的输入判定在内核**：`POST /shell/resolve-input`（能当网址就当网址，否则拼搜索引擎）与 `POST /shell/resolve-target`（导航页跳转框：**不猜搜索**，非网址一律补 `https://`）由 `app/webview.ts` 直接实现，返回 `ResolveResult = { kind: 'url' | 'external' | 'none'; url?: string }`。
- 窗口级操作（缩放 / 最小化 / 关闭 / 对话框）从 `ctx.event.sender` 反查发起请求的壳窗口，**不要用全局主窗口**。

## 数据与配置位置

- **应用设置**：配置目录下 `settings.json`（不是 Electron userData）。
- **dsh 的偏好与组合包配置**：0.1.7 起全部落在 **Cordis patch 层**，没有 `settings.yaml`：
  - **profile 层** `$DSH_HOME/profiles/<profile>/cordis.patch.yml` —— 该 profile 的用户覆盖，dsh UI 的设置表单也写这里（Box 承载 `web`）；
  - **home 层** `$DSH_HOME/cordis.patch.yml` —— 对所有 profile 生效且**优先级更高**；Box 目前只读不写，机器级覆盖由用户自行维护；
  - 旧的 `~/.dsh/settings.yaml` 由 dsh 一次性导入进对应条目后改名为 `settings.yaml.imported`，Box 不再读写它。
  - 条目形如 `- id: ui-theme` + `name` + `config`，`config` 是**整份替换**而非字段合并；纯文本处理见 `dsh/cordisPatch.ts`。
- **Node / npm / dsh**：配置目录下按版本存放（见 references/main-process.md）。
- **配置目录默认**：打包 `~/.dsbox/release`；开发 `~/.dsbox/dev`。
- **覆盖指针**：`<userData>/config-dir`（与配置目录解耦，先于 `settings.json` 读取）。
- **迁移计划**：`<userData>/config-migration.json`。
- **临时下载 / npm 缓存**：工作目录下 `temp/download` 与 `temp/npm`。

## 配置目录两阶段迁移

**第一阶段（设置时）**：`setConfigDir()` 不立即搬迁，只写迁移计划；存在计划时 `configDir()` 仍返回旧目录，保证重启前设置可读。

**第二阶段（重启引导）**：建窗后 `await waitForConfigMigration()` 才启动 dsh 与监听；由 `main/app/configmigrate.ts` 执行：`scanTree` 统计 → `migrateTree` 逐项搬迁（同盘整目录 `rename`，跨盘或目标存在则递归 copy + unlink，记 journal）→ 每项广播 `configdir:migration` → 成功才指向新位置。**取消**则 `rollbackMoves` 逆序搬回并固定回旧目录。搬迁失败不删源文件，避免丢数据。

> 上述函数**全是 async**（`scanTree` 逐目录 `setImmediate` 让出事件循环），大目录搬迁期间界面不卡死。

## 网络出口与代理

- 主进程所有 HTTP 走 `httpFetch(scope, url, init)`（`src/main/dsh/http.ts`）；未启用代理时回落到全局 `fetch`。
- `proxyScope` 六个互不牵连的档位：`app`（主进程自身联网：模型 / 余额 + 内嵌网页）、`update`（应用自更新）、`dsh`（dsh 子进程）、`npm`（安装 / 下载）、`node`（Node 下载部署）、`registry`（版本列表 / 更新检查）。
- 落点三处：`app` → `models.ts` + 内嵌网页（`app/webview.ts` 直接应用代理）、`app/appupdate.ts`；`dsh` → `dsh.ts` 注入的代理环境变量；`npm` / `node` / `registry` → `npmRunner.ts`、`nodeenv.ts`、`manage.ts`。三处共用 `proxyConfigFor()`。
- 代理分支只在「启用代理」时走到，改完需真机验证。

## 设置与状态传播

- 单一来源：配置目录 `settings.json`；`loadSettings()` 读取时按 `settingsVersion`（当前 **5**）做**一次性迁移**。
- **设置结构保持单一来源**：浏览器相关偏好都在内核 `Settings`（`browserUserAgent` / `browserSearchEngine` / `browserShortcuts`）。旧版本曾把它们写进扩展数据目录，`migrateBrowserPrefs` 仍会**逐键**读取 `<configDir>/data/extensions/xeonsky.browser/config.json` 作为迁移输入（缺键才写、失败只 warn）；扩展机制本身已删除，不再产生新的扩展数据。
- 渲染层保存走 `PUT /settings`：主进程落盘后**广播 `settings:changed` 给所有窗口**；文件监听只负责**外部改动**，对程序自身写入刻意静默。
- **凡是从设置派生状态的组件都要订阅 `settings:changed`**；发起保存的窗口忽略这次回放（设置 store 的 `lastSaveAt`）。
- `PUT /settings` 顺带做幂等操作：同步 dsh 主题、写开机自启、更新内嵌网页 UA 与代理、应用程序图标。
