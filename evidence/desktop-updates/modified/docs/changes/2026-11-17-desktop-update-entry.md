# 设置右侧的桌面更新入口

## 模块与职责

- 负责人：本线程；任务 `codex/desktop-update-entry`。
- 基线 main/origin/main：`7f823fe361d082635684c135ce5fdfe3b2e3db18`。
- 独立目录：`E:/Workspace/naumi-desktop-updates`。功能切片计数：1。
- 文件归属：desktop-updates UI 资产、client 异步安装段、host 对应资产注册；桌面 updates/main/preload；发布脚本及本模块测试/文档/证据。不修改群聊、任务数据、模型与身份认证。

## 公共接口、依赖与状态归属

- 复用 `sidebar.footer.action` 原生 list slot，保留原生 `sidebar.settings` single slot 的组件/操作，未替换设置。
- 用户最终指定「设置右边」，因此更新按钮与设置同一行。上游没有右侧专属 seat，最小 CSS grid 适配只在包含该按钮的 native footer 生效；依赖 pinned sidebar 的 `_footArea/_settingsArea/_footerActions` 样式契约，测试校验这些契约。其他 footer action 保留独立整行。
- 折叠模式沿用原生 rail 生命周期；Windows titlebar 模式原生会隐藏整个折叠 footer，不强行改变其布局。
- renderer 只调用 `naumiDesktop.updateState/checkUpdates/installUpdate/onUpdateState`。无 Native API 的网页不显示无效按钮。
- 更新源、版本探测、下载、SHA512 校验依然由已有 electron-updater 管理；不新增账号、token 或另一套更新服务。
- 安装前复用已有 signed maintenance `quiesce`，对 owned/isolated runtime 原子检查任务空闲并封新任务准入。忙碌、活动未知、外连 backend 均保持 ready、不退出。

## 本次实现与迁移状态

1. 设置右侧常驻「检查更新」按钮；点击检查并展示轻量版本面板、下载进度、纯文本日志、错误重试、重启并更新。
2. 订阅先于初始读取，流事件优先于迟到的旧 snapshot；关闭/卸载退订；支持 Escape、外部点击、焦点返回和 resize 关闭。
3. 源探测前即进入 checking，避免手动与定时重复探测。失败恢复 idle，可重试。已下载 ready 不重复检查或下载。
4. 独立 `install()` 可在「稍后」之后重新安装。异步门禁拒绝后保留 ready，安装抛错或 electron-updater 发出 error 时释放本次维护锁；并发点击只交接安装一次。
5. `autoInstallOnAppQuit=false`，所有安装必须显式经门禁。普通退出不会绕过空闲核验自动安装。
6. 修复已有 Release 的重传命令：`gh release edit` 修改说明，再 `gh release upload --clobber` 上传资产；无实际发版。

## 验证命令、结果及证据层级

- 基线：`node --test desktop/tests/updates.test.cjs`，10/10，通过，exit 0。
- 首轮并行全仓 538/539，一个既有 backend SIGKILL fixture 报 `FIXTURE_EXIT`；未修改该模块。它在基线与新版单独复查均 31/31，串行全仓 539/539。补充 updater 以 error 事件报告安装失败的边界测试后，最终集中回归与副本回滚结果见 `evidence/desktop-updates/VERIFICATION.txt`。
- 生产更新组件交互 15/15：同排右侧定位、设置原动作、检查、进度、ready重开、安装忙碌/重试、文本日志、Escape/焦点、外点、resize、折叠与退订。
- 只读核对公开 Release：`v0.3.2`，资产 `latest.yml` + `Naumi-Setup-0.3.2-x64.exe`；公开 feed HTTP 200、version 0.3.2、manifest 字段合法。未上传任何资产。截图中的 0.3.4 是受控测试数据。
- UI 使用生产组件与 pinned native footer CSS，受控桥接状态；不是现有员工安装版或真实远端更新验收。
- 不调用模型、不下载真实安装包、不重启 3080、不操作任务账本。

## 未完成项与下一步

- 本切片不提升版本号，不覆盖既有 0.3.3 安装包，不创建 GitHub Release。
- main 合入后，下一次按固定 main 构建新版本并发布 `latest.yml` + 安装包，安装该版本的员工才能使用该入口；旧包只有已具备的后台检查能力。
- 生产下载、系统安装及重启后版本验收要在实际发版时执行，与本次源码/隔离组件验收分开记录。
