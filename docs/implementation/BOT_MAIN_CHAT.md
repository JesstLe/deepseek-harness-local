# Bot 主聊天与独立后台任务

## 模块与职责
- 负责人：本任务 `codex/bot-main-chat-20261118`，隔离工作区 `E:/Workspace/naumi-bot-main-chat-20261118`。
- 基线：`de4c321da2a152eec70bca0bb874ff66c2a7e12a`；2026-11-18 已 fetch，origin/main 同基线。
- 范围：bot-task-service/store/tasks/runtime、bot-overview 后端与资产、bot-sidebar、primary-bot、相应测试/验收脚本/证据。其余员工、模型、企业、安装器及导入模块不改。

## 调研结论与接口
- 原有跨 Bot 任务已有独立原生 Session、持久队列、next-turn 回传、同任务修订及文件版本，不另建执行器。
- 旧循环保护拒绝向自身派单；新增正式 `bot_task_start` / HTTP action=start，仅稳定 home 接待会话可调用。普通 bot_dispatch 的祖先循环保护保持。
- 新任务可选 `executionKind=self`；sourceBot=targetBot、sourceSession≠targetSession、lineage 仅本 Bot、无 parent、必须 background。旧委派仍至少两个不同 Bot。账本版本不变，旧记录不迁移。
- 精确 worker 仅获得自己任务的 reply 权限；continue/cancel/retry 仍属精确原发送会话，不向同 Bot 其他会话放权。
- 子线程取自原生 subagents.listChildren 公开持久目录，并验证 child.header.parentSession；只读不启动 Agent。每任务最多128、整页256子线程、深度8、10秒读取信号；不可读分支保留 partial 和重试入口，外部非会话项不可点击。

## 实现与迁移状态
- 点击 Bot/进入 Bot 模式打开稳定主聊天，不新建 Session。侧栏“任务”是总览的次级入口。
- 新的独立执行需求走自己的后台任务；普通聊天内联，修改既有任务走 continue。接待先确认并结束当前 turn；worker 继续执行。模型路由依赖实际工具调用，不以提示词本身当完成证据。
- 任务总览按 parentTaskId 归组；重试/修订留在同一 task，原生子线程、子派单线程展开查看；复用 TaskCard、文件版本和原生会话。
- 输入器/草稿/IME/附件/模型/推理努力/权限/停止均使用原生组件，未复制输入器或全局拦截消息。
- 当前 home 不作为任务卡混入，旧非任务会话仍可查看。历史数据不重写。

## 验证命令、结果及证据层级
- 基线：`node --test --test-concurrency=1 tests/naumi-async-bot.test.mjs tests/naumi-bot-task-continuity.test.mjs tests/naumi-bot-deliverables.test.mjs tests/naumi-bot-overview.test.mjs tests/naumi-primary-bot.test.mjs tests/naumi-work-goal-links.test.mjs`：46/46，exit0；`evidence/bot-main-chat/BASELINE.log`。
- 完整切片完成后集中进行模块、原生隔离 Harness/UI、全仓及副本回滚验收；本节随实际结果更新。

## 未完成与下一步
- 当前处于实现阶段；尚未承诺 main 合入、3080加载或安装包更新。
- 不发真实供应商模型，不创建真实业务任务；后续加载前重新核对共享运行状态与窗口。
- 功能迭代计数：1个业务切片；无安装发布计数。

## 集中验收记录
- 首轮模块58/58；全仓首轮822项820通过，两项仅旧工具数量8断言，按正式新增工具更新为9，原失败日志保留。第二轮全仓822/822通过，exit0，99.5秒。
- 真实原生Harness+loopback UI16项通过，包含受理先回复、第二话题先完成、原生停止主聊天不停止worker、原生子线程精确parent、文件快照/回传、草稿、1360/580/360尺寸、页面重载固定home、0页面异常。首两轮脚本误把原生标题生成当主会话及开发期间reload失败已留原日志；最终无该错误。没有真实供应商调用。
- 补充审查：总览纳入相关任务的后续跨Bot子派单，避免后续跳不再直接包含本Bot时漏失；固定main整合后再次集中回归。
