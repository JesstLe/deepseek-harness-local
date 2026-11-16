# Naumi 桌面端 / 原生 Chromium 侧栏

## 2026-11-16：桌面模块完成，接入本机入口

用户已同意用真正内嵌 Chromium 替代 ego 外部窗口托管；要求 Logo 随桌面端完整交付。

### 已核对

- 当前基线 `66c432b`，52 项原有测试通过；原工作区与配置未切换。
- 独立工作树 `E:/Workspace/naumi-desktop-build`。
- 使用 Harness 0.2.2-rc.1 官方 BrowserBody / ElectronWebViewImpl；源包保持不变，派生包仅替换模块注册标识和产品专属桥接名称两处，完整字节等价测试覆盖其余代码。
- 官方主进程租约接口参考代码固定到 `66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db`，保留 MIT 许可。
- 品牌源为现有 `plugins/naumi-enterprise/assets/symbol.svg`，生成 7 尺寸 ICO 与 512px PNG。

### 当前实现

- Electron 宿主，原生 WebView 输入、渲染、历史、DOM 保活；无截图显示循环与 HWND 外部窗口停靠。
- 主进程校验 webview 租约、固定隔离选项；页面加载超时与错误出口。
- 现有侧栏组件包装层只绑定会话/标签与错误状态，保留官方 stores、callbacks 与 docking。
- 结构化工具通过 loopback 临时 token 接入当前会话同一 guest；常规鼠标/键盘不经过此接口。
- 持久化 Cookie 分区当前按 OS 用户 + local 账号 + workspace 隔离。服务器验证的 tenant/user 分区切换尚未实现，不以本地字符串冒充企业身份。
- 完整企业登录/API key 下发属于后续模块；不把个人凭证或浏览器资料装入安装包。

### 集中验收

- 原有 52 项 + 桌面 6 项模块检查：58/58。
- 原生集成 20/20：加载带 `X-Frame-Options: DENY` 的本地测试页面、原生点击/中文文本输入/文字拖选/滚轮/竖直滚动条、侧栏连续拉伸保持同一 guest 与页面标识、收起恢复、视图与页面宽高匹配、切标签保活、Chromium IME 组合事件、同页 naumi_browser 工具操作、无授权桥接拒绝、错误展示、2.5 秒测试超时与恢复、零截图操作传输、guest 无宿主能力、完整重启 Cookie 保留及无 renderer 异常。生产导航超时为 30 秒。
- 中文组合是 Chromium Input.imeSetComposition 自动化验证，不冒充所有 Windows 输入法的手工验收。
- 安装包产物独立冷启动通过：PATH 移除开发 Node/pnpm，仅保留系统目录；使用打包 Node、Harness、agent-desktop。测试端口 3082、独立测试资料，不借用现有 3080 服务。
- 现有 Logo 生成 16/24/32/48/64/128/256 ICO 与 512 PNG；Windows EXE 的 ProductName/FileDescription 为 Naumi。窗口、任务栏、EXE、安装器、卸载器、桌面和开始菜单快捷方式、启动页全部绑定同一品牌源。
- 自动化中发现旧测试坐标不随侧栏宽度变化，已使用实际元素几何；拖动时通过 CSS 关闭 guest hit-testing，页面不隐藏、不重建。
- 冷启动曾发现 electron-builder 未复制 extraResources 下的 node_modules，已改为独立 FileSet，并在去除开发 PATH 后重验成功。
- 本机已有账号配置触发过官方桌面充值引导：其判定只检查 `dshDesktop` 全局是否存在。现改用 `naumiDesktop` 专属桥接与精确两处替换的浏览器派生包，不模拟官方完整桌面、不伪造 API key 存在、不改动引导完成标记或模型/权限偏好。普通新用户的模型配置入口仍保留，企业登录随后替换。
- 退出时提前保留 Electron Session 引用，窗口先销毁的正常退出也能刷写 Cookie 并移除临时工具桥接描述，不遗留失效连接。

### 使用与构建

```powershell
# 本机已有部署：复用现有模型、会话和端口，不复制凭证进安装包
pwsh -NoProfile -File E:/Workspace/deepseek-harness-local/Start-NaumiDesktop.ps1

# 从源码构建员工端的离线运行时和安装包
npm --prefix desktop ci
node desktop/node_modules/electron/install.js
npm run app:stage
npm run app:build
npm run app:test
node desktop/scripts/verify-native.mjs
node desktop/scripts/verify-package.mjs
```

本机启动器记录当前用户的 backend-link.json，安装包不包含这个本机路径。新员工首次启动使用包内运行时与自己的 AppData/Naumi/harness；无个人 API key、Cookie、历史或外部浏览器用户资料。

### 交付与回退

`runtime/naumi-desktop-release/Naumi-Setup-0.2.0-x64.exe` 是 Windows x64 NSIS 内部测试安装包；`win-unpacked/Naumi.exe` 为同版本可启动目录。

原 Web 入口及 ego 独立资料保留。退出桌面端、使用原 Start-Naumi.ps1 即可回到原网页入口。`evidence/naumi-desktop/ROLLBACK.sh TARGET_COPY` 对显式源码副本做逐文件哈希检查、恢复原件、移除本模块新增文件；测试不回滚正在交付的源码，不删除用户资料。对真实工作区执行源代码回退后，再运行原 scripts/sync-naumi.mjs 并重启 Web 服务同步插件。

### 后续模块

企业 SSO / 服务器验证后的 API key 与 URL 下发、服务器签发的租户/员工分区切换、正式代码签名和自动更新尚待实现。当前安装包未签名，作为本次桌面模块的内部测试交付，不宣称企业员工分发全流程已经完成。独立 ego 本体不再是桌面侧栏内核，旧 Web 截图方式仅保留用于原入口回退。

测试证据与命令见 `evidence/naumi-desktop/VERIFICATION.txt`；不以外层布局帧率代替内页交互结果。
