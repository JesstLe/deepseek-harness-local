# Bot 任务输出与会话写入隔离修复

## 模块与职责

负责人：本线程。基线 main/origin/main `e17dc652dbc39ec2420cc092863b30fbbb35e3be`，独立分支 `codex/bot-task-integrity-20261117`，工作树 `E:/Workspace/naumi-bot-task-integrity`。功能迭代计数 1。仅 Bot 工具、任务写入隔离、一次性事故修复、测试和记录；不修改安装器、模型连接、品牌、package、侧栏或文件预览。

## 公共接口、依赖方向、数据/状态/事务归属

- `bot_task_list` 仍是分页摘要；缺失 progress 时省略键，而非返回 undefined。使用真实 `dsh-tools/pipeline` 验证输出快照、校验、render 与最终结果，不依赖 JSON.stringify 的隐式字段丢弃。
- Bot 级 list/get/wait 读取不变。发送方 continue/reply/cancel/retry 必须来自任务持久化的 sourceSessionId；目标方仍必须是精确 targetSessionId 执行端。身份取自真实 agentTeams root，不接受工具参数伪造 Session。新的接待会话可新派独立任务，不自动获得历史任务写权。
- owner HTTP 精确任务卡已提供原 sourceSessionId，因此保留。跨会话工具调用返回 `BOT_TASK_SESSION_REQUIRED`，引导回原会话/任务卡，而不是重派、切换身份或改文件绕过。
- 任务/outbox 继续由 BotTaskStore 原子提交，原生 Session 拥有实际执行和文件事件。没有新增账本字段和数据迁移依赖。

## 调研结论与本次实现

1. 真实任务 `task-2e21b2bc-6f67-4b3c-bf93-569d7ee327c1` 的原始选品正文未变；旧验收 Session `session-12c0a60b-807b-4795-acf9-47f70355e1aa` 于 05:52:54Z 调用了该任务的 continue，把仅输出测试标记的要求写入 instruction。会话工具调用和 outbox 双证据吻合；后续 retry 按设计保留 instruction，结果重复测试标记。
2. 旧验收只筛 sourceSessionId 为测试 Session 的新建任务，漏掉对其他任务的写入。旧“zero tasks / 未修改原业务任务”结论撤回，见 continuity 证据勘误。不是模型随机幻觉，也不是 UI 误渲染。
3. 统一 sourceSession 写入隔离；只读发现仍跨会话。退役曾访问正式 3080 的模型验收脚本，调用立即 exit 2，导入 API/交换凭据/HTTP 前结束。后续验证使用隔离真实 Session、临时账本和随机 HTTP 端口，检查全部 task/outbox delta，不能只数新增任务。
4. 一次性修复器要求停服、端口无监听、账本 SHA、任务 revision、instruction/result SHA 和外来 continue 来源全部匹配。备份原字节，保留原 task、身份、workspace、profile、全部历史；移除 instruction/result/delivery/progress，将当前任务改 interrupted / BOT_TASK_REVIEW_REQUIRED，追加已送达审计说明，封存待发旧消息。不自动排队或调用模型。下次由用户明确 retry。
5. 事故限定一次性修复，不做测试字符串黑名单，不在启动时自动改任务，不删除用户会话/文件。修复器在副本上验证原字节恢复；在线还原污染数据不是默认回滚策略。

## 验证命令、结果及证据层级

- `node scripts/verify-bot-task-integrity.mjs baseline evidence/bot-task-integrity/original`：原生输出失败、同 Bot 外会话写入成功，exit 0（缺陷复现）。
- `node scripts/verify-bot-task-integrity.mjs modified`：原生输出通过、外会话写入拦截，exit 0。
- 定向五组测试 59/59；覆盖原生工具输出、空/缺省/长进度、分页、Bot-wide 只读、终态/活动态外会话四种写入拒绝、零账本/outbox delta、同会话续办、执行端进度、owner HTTP、CAS/篡改拒绝、原子修复、重开与明确 retry、旧危险验收入口禁用。
- 集中全仓、源代码副本回滚、主线加载和真实停服账本修复结果见 `evidence/bot-task-integrity/VERIFICATION.txt`。这些验证不代表真实选品业务重跑成功。

## 未完成项与下一步

业务重跑不是本次修复的自动动作。原交付文件保持；当前污染 attempt 不作为业务完成。任何安装包构建、真实模型业务重试或扩大跨会话授权需独立验收。运行加载前协调 running=0；只增量两个后端文件并保留所有其他运行 hash。
