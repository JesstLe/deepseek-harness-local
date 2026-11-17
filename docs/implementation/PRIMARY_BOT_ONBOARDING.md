# 账号主 Bot 与首次进入引导

## 模块与职责

负责人：primary-bot-onboarding。本任务分支 `codex/primary-bot-onboarding`，工作树 `E:/Workspace/naumi-primary-bot-onboarding`；开工基线与 origin/main 均为 `9f99b1d86d52c651f414007e75f3156b384a0346`。本切片功能迭代计数 1。

范围：BotDirectory/owner HTTP、群默认接待适配、共享目录、侧栏 Bot 模式入口、主 Bot 首次设置页、建群成员表单；host/client 仅追加资源及面板注册。不改线程引擎、任务 CAS、群异步执行、原生 dock、五个业务图标、品牌或模型选择位置。安装器由其他线程维护，本切片不重新打包。

## 公共接口、依赖方向、数据/状态/事务归属

- 账号隔离复用 [统一身份](UNIFIED_IDENTITY.md) 已有 profile 根目录。每个账号自己的 DSH_HOME 下 `naumi/bots.json` 保存可选 `primaryBotId`，不创建第二套账号库，不依据名称、排列、置顶或历史任务猜测主 Bot。
- `GET /naumi/bots` 和首次点击只读目录；空目录不落盘、不创建员工、不调用模型。线程模式保持原行为。
- `POST /naumi/bots` 新增严格命令 `create-primary` / `select-primary`，沿用 owner 准入、同源 header、Origin 校验和 4096 字节限制。创建提交 `requestId` UUID、目录 `expectedRevision`、名称和可选原头像枚举；认领提交已有 `botId` 与目录 revision。
- BotDirectory 先原子保存 `primarySetup` reservation，包含固定 Bot/Session ID、请求 ID、工作区与现有默认 preset/model；再调用既有 task runtime.ensure 创建真实 native root Session，确认 Session 持久化并通过原 workspace.attachSession 登记后原子发布 Bot 与 `primaryBotId`。全程不调用 prompt/deliver，不发业务任务。默认权限仍由原 preset 挂载，无额外授权；不复制其他会话的权限。
- Runtime、Session 持久化与模型仍由原引擎拥有；BotDirectory 只拥有身份关系和创建 reservation。创建失败/工作区登记失败/完成写盘失败/重启后继续同一个 reservation，原 Session ID 不变。同目录所有服务使用原写队列和 CAS；单 profile 的现有单宿主约束不变。
- 新账号复用已有工作区；没有时调用原 workspaceController.initializeDefault，再从原 registry 读取路径。用户曾删除默认工作区时不强行恢复，返回可操作失败。没有另设 API Key 页面。
- 老账号不自动认领：用户可以选择启用且 home root Session 存在、未归档的原 Bot，或创建新的。认领只写 `primaryBotId`，原 Bot 内容、Session、文件和任务保留。主 Bot 改名不改 ID；直接归档主 Bot 被拒绝。当前没有主 Bot 交换/删除产品入口。

## 本次实现与迁移状态

- 首次点击 Bot 显示浅色主面板，名称必填、头像可选；已有 Bot 时可切换“创建新的 / 使用现有 Bot”。请求在途防重复点击，失败保留输入，pending reservation 可刷新继续。
- 后续点击 Bot 模式明确进入 `homeSessionId`，不跳到后台执行 Session；普通 Bot 历史导航、线程模式、置顶仍保留。主 Bot 排在会话列表顶部但不复用置顶字段来判断身份。
- 新群默认包含主 Bot、默认由主 Bot 接话，建群表单不再额外让用户选主管。明确点名/显式选成员优先，任务修订仍回原 `sourceSessionId`，不因主 Bot 身份放宽写权限。
- 认领/创建后，已有群通过同一 SQLite 事务补入主 Bot 并切换默认接话；原成员的群 Session、消息、回复、任务来源都不换。既有 12 人群允许一次兼容性的第 13 个主 Bot 席位，不静默删除任何旧成员；新群仍最多 12 人（包括主 Bot）。同步失败可在下一次 read/create/post/prepare 重试。
- BotDirectory 仍读旧 version=1 空字段数据，无自动内容迁移。新 metadata 对旧严格 schema 读取器不兼容：源码副本回滚测试不等于对已完成引导的真实目录直接降级。在线回滚必须保留新增元数据读取兼容层，或使用确认无新业务写入的对应数据快照；本任务的回滚脚本只面向另一个源码副本，不降级员工目录。

## 验证命令、结果及证据层级

- 基线：`node --test tests/naumi-bots.test.mjs tests/naumi-bot-runtime.test.mjs tests/naumi-bot-groups.test.mjs tests/naumi-bot-groups-http.test.mjs`：38/38，exit 0。
- 新增 `tests/naumi-primary-bot.test.mjs`：显式身份、并发幂等、CAS、写盘/ensure失败、重启续建、账号目录隔离、老 Bot 认领、root/归档验证、默认工作区返回契约、主 Bot 导航、旧群数据与容量保留、默认与点名路由。
- 全仓与真实隔离 Harness/浏览器验收、源码副本回滚、本地运行加载结果统一收口到 `evidence/primary-bot/VERIFICATION.txt`，只记录实际完成层级。隔离模型连接只指向拒绝推理的本地 HTTP fixture，不调用真实供应商。

## 未完成项与下一步

开发状态以最终证据为准；源码合并不等于运行加载。正常增量加载不替实际账号自动创建或选择主 Bot，用户刷新后进行一次显式设置。头像建模、安装包构建、后台账号/模型网关不属于本切片。

## 主线同步

首次实现基线 9f99b1d；集中验收前 fetch 得到 origin/main 4c44363，包含安装器路径加固与群 Markdown 流式修复。保留这些主线改动；本模块迭代计数仍为 1。共享 main 下 installer-path-fix 未跟踪证据不暂存、不清理。

## 验收进度

已整合 origin/main 4c44363，集中回归 573/573，exit 0。真实隔离 Harness：首次创建、旧账号认领、原生 home、默认群成员与原生 composer 均已通过，page errors=0，model calls=0。源码副本基线/回滚各38/38；正式数据未用于这些写入测试。新增历史文件规划按用户选择见 [迁移规划](BOT_WORKSPACE_MIGRATION.md)，规划不等于实际搬迁。

正式增量加载成功：固定 main e664224（已包含并行群改名源码），11文件，HTTP200，92sessions/0running/3bots/revision36；101个受保护文件和当时92个无关运行文件哈希保持。随后并行群改名仅补齐其自身catalog/CSS并完成验收；本任务不覆盖这些增量。已再整合main b18bfdc。最终源码副本回滚基线使用078142a（有群改名、无主Bot），保留其他线程功能；开工原始基线38/38记录不变。
