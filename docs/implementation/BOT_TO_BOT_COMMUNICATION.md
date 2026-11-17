# 独立 Bot 任务通信

## 目标与现有基础

用户要求主管直接给已有 Bot 派任务。上游 Team 的 `send_message` 只认识当前 Team roster，不是跨 Bot 总线。本模块不改 Team 服务，也不把所有 Bot 强塞进一支 Team。

本地 Bot 目录继续管理稳定身份。新增任务路由器为目标 Bot 创建独立根 Session 并绑定到原 Bot ID，使用原 Harness Agent registry、preset、模型与消息 inbox。原有 UI、Team、模型选择控件与业务登录不变。

## 实现模块

- `bot-task-store.js`：原子文件事务、版本校验、任务与回复 outbox 同事务落盘。
- `bot-task-runtime.js`：公开 Agent create/resume/send API 适配；读取目标 Bot 的模型/preset/权限；按稳定消息 ID 检查真实 Session 收据。
- `bot-task-service.js`：派单、同 Bot 排队、跨 Bot 并发、等待、反馈、取消、重试、回传、恢复。
- `bot-tasks.js`：真实调用者身份的工具注册、系统上下文与 owner-only HTTP/SSE 接口。
- 入口通过已有 `installBots` 加载；插件 package files 显式包含所有模块。

## 工具

`bot_dispatch / bot_task_list / bot_task_get / bot_task_wait / bot_task_reply / bot_task_cancel / bot_task_retry`。

派单必须使用 `bot_directory` 的 Bot ID 与稳定 idempotencyKey。重复调用返回同一任务；同 key 不同载荷报冲突。创建替代 teammate 不是派给已有 Bot。

```js
bot_dispatch({
  targetBotId: "bot-<从 bot_directory 获取>",
  task: "根据已确认素材完成文章，返回正文和依据",
  idempotencyKey: "article-20261116-01"
})
// 后续使用返回的 task.id / revision 调用 bot_task_wait；结果由 outbox 自动回传原主管会话。
```

## 生命周期与恢复

- `queued → starting → running → completed / failed / cancelled / interrupted`；需要主管澄清时进入 `waiting`，收到反馈后继续原任务 Session。
- 保存身份、受理任务、执行成功、消息回传成功是不同事实；工具返回均保留真实状态与 revision。
- 默认最多 4 个派单任务同时运行，同一 Bot 的派单任务串行。未接受的队列在恢复后继续；已消费但未有可靠完成记录的任务标记 interrupted，等待明确重试，不自动重做外部操作。
- 结果从对应任务消息所在 turn 的最终 assistant 文本和 completed 结束记录提取，不把“Agent 空闲”当成功，不取其他 turn 的文本。
- 最终状态与 outbox 同时持久化；投递采用固定 message ID，目标 inbox/历史已有收据就不重复投递。未发送结果保留，恢复时重试。
- 重试复用 task ID、Bot ID 和 target Session，仅增加 attempt；失败会话历史保留。
- 明确区分循环与正常多级委派：拒绝回到祖先 Bot，最多 4 跳；任务数、消息数、消息体均有边界。

## 身份与配置

- 写操作由精确的 live Team Lead 发起。读取限定于源/目标 Bot；目标结果只能由该任务实际执行 Session 报告。
- 目标沿用自己的 cwd、preset、model、reasoning effort 和已记录的权限事实，不继承主管的宽松权限，不修改全局默认配置。
- 消息采用 `agent-message / relay / senderSessionId`，不伪装成用户；正文只作为委派内容，不作为更高优先级指令。
- HTTP 复用 Harness owner 登录态；写入需同源和固定自定义 header，拒绝任意 preset/model/permission 覆盖字段。

## 验证进度

- 集中回归共 90 项通过，含真实 Cordis 注入边界、真实 Session schema、HTTP、权限继承、目录/Team/enterprise 回归。
- 实际运行 Harness 联调成功：已有“项目主管” → 已有“自媒体内容运营” → 主管最终回复。目标模型配置一致，消息以 agent-message/relay 真实进入主管会话。
- 第二次自然语言联调确认模型自主使用 `bot_dispatch`，没有 `spawn_teammate`；任务完成、结果投递、主管最终答复全部有持久化记录，整条验证约 8 秒。验证只返回固定文本，不代表任意业务任务都在 8 秒内结束。
- 两次联调均没有新增 Bot；4 条验证会话结束后通过原 archiveSession API 归档（stopActivity=false），完整日志保留。
- 部署只改运行插件 6 个文件：bots.js、package.json 与 4 个通信模块。36 个原文件中的其他文件哈希不变；安装包清单已核对包含 4 个新模块，未重建桌面安装 EXE。
- 原件、差异、增量 ZIP、基线/修改/回滚脚本及实际日志见 `evidence/bot-communication/`。回滚不删除 Bot 目录、任务账本或 Session 记录；运行服务需重启才会加载恢复后的模块。
- 本轮不重做布局；左侧已有 Bot 自然显示新关联任务，会话内保留工具状态与结果。独立的跨 Bot 任务看板不是本轮交付项。
