# 主 Bot 员工管理与手动创建

## 模块与职责

负责人：primary-bot-management。本任务分支 `codex/primary-bot-management`，独立目录 `E:/Workspace/naumi-primary-bot-management`；开工/远端基线 `7de781ffac355e360c4a418d2947da7873ea2367`。功能切片计数 1。

范围：bots.js（目录、创建/管理、原工具和 owner HTTP）、bot-task-service.js 的生命周期准入守卫、侧栏加号及原 primary 资源中的创建弹窗/共享目录、测试与本模块脚本。host/client、package、图标、模型位置和原生 composer 不变。共享 main 的 group-rename/PACKAGE.txt 修改与安装器未跟踪文件归原线程，保留不暂存。

## 调研结论

原 `bot_create` 把调用根 Session 绑定成 Bot。主 Bot 自己已绑定，再创建不同名称会报 BOT_SESSION_ALREADY_BOUND；若通过重绑定绕开，会丢失主管身份。原“新增员工”只是开启一个含创建指令的 AI 草稿，不等于手动创建。

保留原目录与 Session 引擎，不新增并行员工系统。主 Bot 侧的创建与加号表单共用 PrimaryBotService.createBot；普通线程原有建立自身 Bot 的工具行为仍兼容。

## 公共接口、依赖方向、数据/状态/事务归属

- BotDirectory 增加可选 `creations[]` 受理/完成记录，保存 actor+requestId、稳定 Bot/Session ID、名称/职责/类型/头像、专属路径和已有默认 model/preset（无 API Key）。先落盘 reservation，再原生创建，最后原子发布 Bot+completed 回执。
- `POST /naumi/bots` 增加 `create`（UUID、目录 CAS、fields）与 `update`（目标 Bot ID、目标 Bot CAS、白名单 patch）。沿用 owner、Origin、自定义 header、4096 字节上限；不接收客户端 actor、cwd、model、permissions、密钥。
- 新员工工作区为当前账号 DSH_HOME 下 `naumi/workspaces/<stable Bot ID>`。使用原 WorkspaceRegistry.create/attachSession 与 task runtime.ensure；创建独立 root home，无 prompt、无业务任务。仅继承既有默认 model/preset 与 preset 默认权限，不复制主管的会话授权。
- 原 `bot_create`：真实 Lead 的根身份属于 primaryBotId 时，新建另一个 Bot，不调用 bot_use、不重绑主管会话；普通未绑定线程保留原 create 行为。稳定 idempotencyKey（缺省原生 callId）用于重试。
- 原 `bot_update`：未指定 targetBotId 时修改自己；只有账号主 Bot 的 Lead 可以指定其他 Bot。支持名称、职责、头像和归档/恢复；禁止更换主身份、会话、工作区、模型、权限或硬删除历史。
- archive 不取消业务任务。管理器先检查在途任务，设置短期目录生命周期锁，等待已准入任务账本写入排空后复核，再 CAS 更新。dispatch/continue/retry 在持久化准入时再次检查锁与身份状态，避免归档并发接受一个无法运行的新任务。原始 sourceSessionId 写隔离仍保留。

## 本次实现与迁移状态

- 加号位置与“新增员工”菜单保留，点击打开浅色真实表单（名称、类型、职责）；不新增编辑器或模型设置页。创建成功直接打开员工自己的原生接待会话。
- 失败保留输入与请求 ID，已受理但尚未完成的 owner reservation 可重新打开后继续；丢回执重试不重复员工、目录或 Session。头像仍可由原设置入口编辑，也可让主 Bot 通过 bot_update 调整。
- Bot 名称与岗位由用户/主 Bot 决定，无硬编码员工模板。新 Bot 成功后不自动执行任务、不连接外部账号。
- 只为本次新创建员工生成专属工作区，不擅自搬旧 3 个 Bot 的历史文件；原历史迁移规划保持，见 [迁移规划](BOT_WORKSPACE_MIGRATION.md)。

## 验证命令、结果及证据层级

- 基线：`node --test tests/naumi-bots.test.mjs tests/naumi-bot-runtime.test.mjs tests/naumi-primary-bot.test.mjs`，41/41，exit 0。
- 单元/集成覆盖：主 Bot 身份保留、分离工作区/home、手动/工具统一创建、并发幂等、重启恢复、ensure/写盘失败、actor/账号隔离、目标管理与 Lead 校验、在途归档拒绝及归档/派单并发。
- `node scripts/verify-bot-management.mjs`：真实隔离 Harness+原生 Agent 工具执行+React 壳。推理仅访问脚本内本地 SSE fixture；真实供应商调用 0。主 Bot 实际执行 bot_create/bot_update，不用模拟 DOM 或直接写用户目录冒充工具成功。手动表单创建和重试无推理请求。
- 最终全仓、源码副本回滚、main 与本地增量加载凭证收口在 `evidence/bot-management/VERIFICATION.txt`；不把 fixture 的原生工具执行冒充真实模型自然语言选工具验收。

## 未完成项与下一步

以最终凭证区分源码/加载状态。正式加载不自动创建员工、不替账号选择 primary；用户刷新后使用入口。历史文件迁移、任意专业能力安装与真正供应商的语言理解不由创建成功代替。

原读取器不识别新增 creations metadata；本模块回滚脚本仅验证另一个源码副本，不用旧读取器直接降级已创建新员工的真实目录。
