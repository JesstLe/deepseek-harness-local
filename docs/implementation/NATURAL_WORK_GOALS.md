# 日常自然目标提议与确认 D3

模块与职责：主线程负责从真实用户消息提出工作目标、owner确认或忽略的闭环；不实现另一套任务/输入器/模型调度。基线main/origin/main 83e7b3b3f779a6be9939ac54c10c2e1729e267fb。独立分支codex/natural-work-goals；worktree E:/Workspace/naumi-natural-work-goals。企业模块保持当前状态。

公共接口、依赖与状态归属：复用EmployeeService.evidence对原生用户消息/引用及持久化的校验；EmployeeWorkStore借原employees.sqlite entities/events/operations保存goalproposal实体。提议不是goal，不派单、不启用规则、不通过业务验收。owner确认时在一次SQLite事务中保存原goal及proposal resolution，使用原CAS/operationId；用户可在原GoalForm中调整后确认。原任务和交付状态机不变。

文件归属：employee-work-store.js、employee-work.js、employee-store.js仅work导出新增提议清单、assets/employee-center.js和employee-center-model.js、对应定向测试/隔离UI runner、打包/增量加载脚本和本任务文档证据。协作线程继续负责bot-overview/bot-titles/bot-workspace-migration/bot-file-versions/bot-task*，不双写；不改host/client/package/模型位置。

设计取舍：没有把自然语言直接变成已授权目标/工作；模型可提出目标但确认仅owner。同原始用户消息与相同内容的提议跨operationId去重，忽略后不自动复活。提议仅保存有限公开来源片段，现有凭证文本保护继续生效。表单/审核/工作目录等继续复用，不复制通用行为。

本次实现与迁移状态：开发中；schema仍1，仅新增一种实体，不迁移旧数据或企业配置。
验证命令、结果及证据层级：基线原工作与日常模块；完整实现后集中测权限/CSRF/幂等/CAS/并发/写失败/重开与原生壳交互。
未完成与下一步：完成实现、集中验证、源码副本回滚、普通合并推送、空闲增量加载；自然语言真实供应商、派单关联、历史工作区、固定文件版本及安装发布继续分别验收。

集中初测：24/24模块通过。全仓首次722/723，唯一失败为原employees teardown测试固定卸载10工具，而新工具后应为11；已更新精确数量并新增employee_goal_propose确实卸载断言，不跳过测试。UI首次runner误找不存在的“打开当前聊天”菜单，已按现有Bot原生打开按钮修正；初次失败保留。

当前实现：已完成新原生工具、真实来源/持久化校验、跨操作去重、owner编辑确认/忽略、原GoalForm复用、工作列表可见时15秒轻量刷新（开表单/交付详情/隐藏文档时不抢刷新）、导出包含提议、工具卸载。24/24首轮模块与30/30含旧员工模块通过，原生壳15项通过；实际PiAiAdapter/AgentLoop的4次loopback请求，0真实供应商，独立profile/账号/随机端口，无3080写入。1360/360截图均已打开检查。

数据与回滚：新增goalproposal实体不改SQLite schema；旧读取器不显示提议但不删除它，已确认goal保持原契约。源码副本回滚不是在线数据库降级，不删除提议或用户确认记录来伪装回退。

最终集中结果：30/30模块、723/723全仓（0skip）、原生壳15项、源码副本13/13全部exit0；14路径ZIP CRC/哈希与9原文件恢复/5新增删除通过。具体命令/输入/字面结果与证据层级见evidence/natural-work-goals/VERIFICATION.txt。源码已就绪，合并/加载分别继续记录。功能切片计数1。
