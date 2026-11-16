# M1：本地数字员工连续性

日期：2026-11-16。对应 PRD：`../prd/NAUMI_DIGITAL_EMPLOYEE_PRD.md`。实施模型：GPT-6.1 Sol。

## 已实现

1. `employee-store.js`：Node SQLite WAL，档案、记忆、版本事件、operationId 去重与 local_only 待接入事件；事务失败回滚，未知数据库版本拒绝初始化。
2. `employee-service.js`：精确 Bot/Lead 身份、真实 user message 来源校验、候选提案、明确偏好学习；统一心跳快照与只读存储巡检。
3. `employees.js`：4 个模型工具、历史数据上下文、真实会话事件监听、owner-only CRUD/历史/导出/heartbeat HTTP 接口、卸载清理。
4. 通过 `installBots` 的独立子模块接入；package files 包含全部新增模块；现有模型、权限、UI 和业务登录不修改。
5. 本地数据 `${DSH_HOME}/naumi/employees.sqlite`；没有把现有 Bot 目录/任务 JSON 或 Session 迁移成另一套数据。

## 可直接使用的明确指令

```text
记住我的偏好：标题少一点营销味
以后回复先给结论
以后回复简洁直接
以后回复详细解释
以后回复少用术语
```

规则仅处理单独的、真实用户消息。临时语句、relay 和复杂混合要求不自动固化。其他人设变化通过候选提案后由 owner 确认。autoLearning=false 时自动学习和模型提案均停止。

本期自动提取是明确语法的确定性处理，不是隐藏的泛化 LLM 分析器。记忆不会自动回扫所有历史聊天。

## 可复用的 Agent 使用提示

```text
你是当前 Bot 的员工执行者。先用 employee_profile 查看已有设定；必要时用
employee_memory_search 检索与任务相关的 active 记忆。当前要求优先于历史风格。
不要编造回忆，不修改模型和权限。需要沉淀经验或调整人物设定时，引用当前
Bot 根会话里真实用户消息的 sourceMessageId 和原文 quote（employee_profile
返回 recentUserSources 可取得这些标识与摘录），调用
employee_memory_propose / employee_profile_propose。候选尚未审核时不要说已生效。
```

## owner 管理接口

GET `/naumi/employees?botId=BOT_ID&view=profile|memories|history|export|heartbeat`。

POST 同一路径，沿用 Harness owner cookie；header `x-naumi-employees: 1`；同源。

示例载荷（不要填入 cookie/ApiKey）：

```json
{"action":"profile_update","botId":"BOT_ID","expectedRevision":0,"operationId":"profile-1","patch":{"personality":"直接、重视证据","persona":"善于协作的资料研究员"}}
```

```json
{"action":"profile_update","botId":"BOT_ID","expectedRevision":1,"operationId":"lock-1","patch":{"lockedFields":["personality"],"autoLearning":false}}
```

```json
{"action":"memory_create","botId":"BOT_ID","operationId":"memory-1","kind":"procedure","text":"交付文章前复核引用来源","status":"active","pinned":true}
```

```json
{"action":"memory_update","botId":"BOT_ID","memoryId":"MEMORY_ID","expectedRevision":1,"operationId":"review-1","profileRevision":1,"patch":{"status":"active"}}
```

最后一例用于含 proposedProfile 的人设候选确认，profileRevision 必须是当前档案版本；普通记忆确认无需该字段。

历史恢复使用 profile_restore + targetRevision + 当前 expectedRevision；锁定字段不允许连同恢复操作偷偷改写。删除记忆为逻辑删除，检索/注入立即排除，原 Session 与审计不因此被抹除。

## 心跳的实际含义

- 默认 30 秒运行采样，5 分钟刷新本地存储统计；Agent 状态事件触发即时采样。
- 只观测，不启动模型/任务/重试，接口返回 modelCalls=0 / actionsStarted=0。
- sampledAt 为实际采样时刻，读取不会刷新；staleAfterMs 默认 90000。
- 这不是已实现的主动运营规则、进度催办、截止时间升级、服务端心跳或云端接管。

## 验证与发布记录

- 第一轮新增与核心回归 107 项通过。
- 增加双连接 CAS 与 JSON 转义上下文边界后，全仓 Node/桌面策略测试 156/156 通过。
- 实际运行 Harness 验证：在项目主管一个联调会话发送明确记忆指令；另一新会话真实调用 employee_memory_search 并返回标记；原人物设定保持不变。
- 验证产生的固定标记记忆已逻辑删除，2 条联调 Session 已归档，原始日志和审计保留。
- 控制中心不可达时的数据层无网络依赖已由本地模块证明；尚未实施企业授权到期、真实服务器切断和多设备同步故障实验，不能称完整企业离线模式已完成。
- 四件套、原/新 hash、测试及联调记录见 `evidence/employee-foundation/VERIFICATION.txt`。

## 未完成项

- 员工管理 UI（档案页、候选审核、记忆列表与版本差异）属于 M2，当前使用会话工具与 owner API。
- 企业 RBAC、共享记忆、服务端同步、签名离线授权、凭证存储和模型网关容灾属于 M3/M4。
- 自动泛化记忆提取、经验合并与主动工作规则不在本轮启用。
- 员工安装包未重建；只是验证插件打包清单与当前本地运行版接入。
