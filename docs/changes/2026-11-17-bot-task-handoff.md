# Bot 跨会话任务交接

负责人为本次任务切片。分支 `codex/bot-task-handoff`，独立工作树 `E:/workspace/naumi-desktop-bot-task-handoff`。开发时主线 `cf3859221257e4f0463e940d627e057a5d991f22`，上游群聊与历史分支 `47ef8064dde6b67ec6ee347832d733a0f14c6d42`。应用现有 `AGENTS.md` 和 `docs/AGENT_COLLABORATION.md`。约定中的两个 `docs/engineering` 文件在工作树和远端均不存在。

## 模块、接口与数据归属

- 任务目标、验收清单、用户原话、最新补充和关联上游任务随任务账本原子持久化。`bot-task-handoff.js` 负责取证与投影，任务结果和原文件引用依旧由任务账本和各原生 Session 管理。结构字段可选，既有账本直接读取。
- `bot_task_continue` 仍在原任务的原 Session 工作。可传 `acceptance` 更新整份验收清单。最近一次明确补充优先，原任务文本和原验收记录保留。真实用户原话绑定到 Harness Session、消息 ID 和轮次。工具执行只记录当前未结束轮次内实际收到的用户消息，不把转发内容记作用户原话。原生执行会话人工追加修改时也更新最新补充。
- 需要不同 Bot 做独立下一步时，原派单 Session 调用 `bot_dispatch`，附 `handoffTaskId` 和 `handoffRevision`。原任务须为已完成的指定版本。新的审核工作有独立任务和 Session，使用既有角色校验、CAS、幂等键、排队和结果回传。owner HTTP 支持同样字段。
- 交接快照携带原任务目标、最近明确补充、当前验收清单、已完成结果和原生文件引用。派发或恢复待处理消息前核对上游版本、交付事件、文件版本和接手 Session 工作区。文件仅作为输入，复用原文件，审核 Bot 的完成仍由自己的回执判断。群任务提供打开上游任务的入口。

## 验证与未完成项

- `node --test tests/naumi-bot-task-handoff.test.mjs tests/naumi-bot-groups.test.mjs tests/naumi-bot-groups-http.test.mjs` 15 项通过。使用生产任务服务、真实持久化账本、真实临时文件和生产文件校验函数，Harness 执行回执由夹具提供。覆盖用户从价格改为材质、重启后交给第二只 Bot、打开原稿内容、报告未决证据、重试不重复入队、来源权限、接手工作区和原稿变更失效。
- Chrome 群聊回归通过，验证任务、上游任务及原生文件入口，0 page errors。相关文件通过 `node --check` 和差异校验，`npm pack --dry-run` 包含新增交接和群聊模块。
- 合并基线同步至 `ed5653ef19cf6ef2fa3fde26703afde80d2f6e51`，开发基线之后的主线变更在模型配置与验收记录，此切片改动文件无重叠。
- 真实 Harness 与模型端到端验收仍待启动。`npm ping --registry=https://registry.npmjs.org` 失败为 `ENOTFOUND`，环境未找到可用的 Naumi/Harness 安装。继续使用隔离分支，不把受控执行和浏览器回归写成已部署模型验证。此切片功能迭代计数 1。
