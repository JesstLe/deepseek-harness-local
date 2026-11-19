# 浏览器连接与网站账号

## 模块与职责

2026-11-19，任务分支 `codex/browser-connect-20261119`，基线 `074cc24`（包含同事0.4.4 CUA整合）。
新增 `desktop/app/browser-{connect,external,vault,manager*}` 与 `browser-extension/`；现有 main/preload/tools、browser Agent工具和native入口只做注册及路由增量。不改CUA、原生浏览器组件实现、账号权威、企业角色、版本、安装器或模型配置。

## 调研及复用

- 原 native webview 已用 persist partition 按 Naumi账号/工作区保存Cookie和网站状态；本次不重命名分区或删除旧登录态。
- 原 `naumi_browser` 与Desktop loopback `/op` 已有会话绑定和工具队列。本次沿用同工具、原生队列/页面和输入器，不另建任务执行链。
- 普通已打开的Chrome/Edge不能靠启动参数无损变成调试实例；也不应靠复制/解密浏览器用户资料实现接管。用用户安装的MV3扩展、官方debugger API连接用户当前选定的原标签页；无需重启或复制profile，原浏览器Cookie/LocalStorage/已保存密码管理器自然留在原位置。
- 现有CreationVault处理创作令牌而非网站账号。仅复用其本机私有目录DACL保护，不混用令牌数据；新BrowserVault用Electron safeStorage加密，不接受basic_text退化。

## 公共接口、依赖及状态归属

- `BrowserConnections` 是 `BrowserTools` 的组合路由。原生页面仍由Guests管理；外部页面只由 `ExternalBrowserHub` 持有显式绑定。会话级队列覆盖原生/外部切换及账号填入，供既有更新空闲门检查。
- 短期配对码仅通过可信原生窗口复制到剪贴板，不返回Agent。首次attach绑定扩展origin及Naumi会话，后续只接受同origin+Bearer、127.0.0.1 Host；页面Origin、其他扩展、过期配对与重复poll拒绝。
- 每次操作单独UUID，poll只分发一次；超时/断连/结果丢失不重做写入。断连保留外部模式，除非用户明确选原生页面或断开连接，不静默操作别的页面。关闭Naumi撤销所有外部租约，不关闭用户标签页。
- 扩展权限是debugger/activeTab/storage/alarms与loopback访问，没有Cookie导出权限、密码库读取或任意站点资料目录访问。只对用户点选的标签attach，不列出无关标签。扩展本地session存连接信息，关闭浏览器不自动重建接管。
- 网站账号在当前Naumi身份目录中加密保存；UI仅在独立file窗口的preload暴露保存/删除，远程网页拿不到此IPC。模型只收到允许用于当前确切origin的账号ID/用户名。
- `accounts`只读元数据；`login(accountId,usernameSelector,passwordSelector)`在目标页面内检查origin与真实表单，填入不提交、不返回密码。网站密码管理器保持由原浏览器管理，Naumi不读取其中原始密码。

## 实现/迁移状态

已有内置浏览器继续默认使用。聊天顶部新增「连接」，原生管理窗口负责扩展文件导出、配对、查看已连接标签、断开、网站账号添加/删除。扩展文件从asar复制到有版本hash的普通目录供Chrome/Edge加载，不覆盖用户修改后的导出文件。
没有修改已有Cookie或账号存储schema；没有导入/导出用户浏览器Cookie，没有改系统默认浏览器。

## 验证与证据层级

- 真实Chromium + MV3官方debugger接入21检查通过：原标签页不新增、HttpOnly Cookie/LocalStorage保留、浏览器重启保持、DOM snapshot/click/fill、会话隔离、凭据本机填入且模型回包无密码、没有自动提交、断开保留原页面及无效目标拒绝。额外覆盖同一浏览器换会话重配对：旧poll/断连清理不能删新连接或将操作误送旧会话。headless测试只在临时扩展副本追加一个测试入口调用原connectCurrent函数；正式扩展没有此入口，不把自动fixture当用户已安装扩展。
- 真实Electron + Windows safeStorage/DPAPI + 私有DACL分两次宿主启动13检查通过：原生HTML/preload表单真实保存、密码框清空、磁盘非明文、进程重启解密读回、其他Naumi身份目录隔离、origin变化拒绝和删除。源数据是明确fixture，不是用户网站密码。
- 首轮全仓993/994，唯一失败为独立worktree没有Git忽略的CUA固定二进制；不修改同事CUA源码，后续从现有0.4.4包读取并核对固定SHA后补本任务隔离副本，集中回归另记。初始错误日志保留。
- 固定二进制副本补齐后，全仓曾995/995、exit0。最终会话换配对修订后的一轮默认并发出现未改动linked-service测试的 `LINKED_SERVICE_REQUIRES_STOP` 端口时序失败（994/995）；该模块单独复测9/9通过，原失败保留，不修改安装/服务源码掩盖它。最终固定源码使用 `node --test --test-concurrency=2 tests/*.test.mjs desktop/tests/*.test.cjs` **995/995、exit0**（含本模块25项与已有原生/账号/升级/任务回归）。原始CUA二进制与源码未修改，未发真实模型。
- 首轮真实扩展runner在ServiceWorker中动态import测试入口被浏览器拒绝，改为仅fixture追加入口；首轮Electron runner对跨进程异常文案假设不成立，改为验证拒绝及原输入值未变。两者初始失败保留，不隐去失败来虚报首次全绿。
- 源码副本、最终计数、命令和四件套见独立交付根目录 `E:/Workspace/naumi-browser-connect-evidence-20261119/VERIFICATION.txt`。源码/隔离/安装版分开记录；本线程未重启共享3080、未发真实模型。
- 能力契约基线为1通过/7缺失，修改后8/8；独立副本精确恢复8个原文件、移除19个新增文件后重新得到同1/7，原29项浏览器回归基线/恢复均29/29。修改交付包保持新状态，实际用户资料不参与回滚。

## 未完成项

- Chrome/Edge商店上架不属于当前已交付；开发者模式加载的扩展需用户首次安装并主动连接。企业浏览器若禁止扩展或debugger，连接会明确失败，不关闭/重启用户浏览器绕行。
- 系统密码管理器原始密码不读取，现有网站认证会话直接复用；新登录可由浏览器自动填充或用户在Naumi本机加密库保存账号后使用。
- iframe内部字段和复杂跨域登录仍需网站流程验收；验证码/多因素认证由本人完成。
- 安装版/更新包发布另行固定main验证，不把源码合并当已上线。
- 同事正在验收的固定0.4.4/CUA安装包不包含此后续浏览器切片，本线程不重打、覆盖或热改该包。首次使用需要从包含本模块的后续固定main构建Desktop；未声称用户当前已出现连接入口。
- 2026-11-19接收微信线程协调：浏览器与微信一起进入下一份完整固定bundle；本轮只源码整合与证据，不对managed profile热补，不修改当前安装资源。
