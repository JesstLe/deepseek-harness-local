# 员工接待、任务聚合与同任务续办

## 模块与职责

本线程负责 task service/store/tools、bot-task UI/model/CSS、Bot 侧栏及右侧 team panel。独立 `codex/bot-task-continuity-20261117`，worktree `E:/Workspace/naumi-bot-task-continuity`，基线 main/origin/main `c1fe9f0955f5d2344cbf3f7c6a2d2523fd2fa3b3`。前一轮卡片回收已先收尾并普通合并；无并行子代理或同文件共同写入。

## 公共接口、依赖方向、数据/状态/事务归属

Bot 目录拥有员工及固定 home；独立任务继续拥有 target Session；账本事务管理 round/消息 outbox；原生 Session 保存上下文和文件登记。增加 `bot_task_continue`/owner HTTP `action=continue`（taskId、expectedRevision、idempotencyKey、message），仅原派单 Bot Lead 可执行，沿用现有 owner/origin 校验。新增可选 `instruction` 保存本轮明确修改，不改原任务正文、工作区、模型、权限或 Bot ID。

## 本次实现与迁移状态

- 固定聊天入口与执行入口分开：点员工仍进 home，工作数量按钮进当前执行会话，执行会话右侧可回到员工日常聊天。
- 右侧聚合本 Bot 接收/发出的所有委派任务，同时保留原生 Team 子任务。共享原任务订阅，不因打开 home 而显示“暂无任务”；历史默认收起且每批 10 条。会话运行统计明确标注是当前会话，不伪装成整个员工的运行速度。
- 运行中/等待中收到补充继续原任务；排队补充先持久化，创建/绑定执行 Session 后再投递，不误标运行。完成后的修改增加 attempt 并复用原 task/Session，清理本轮 result/delivery，旧结果和文件事件继续保留。
- 自然语言路由区分独立新工作与旧工作修改，一次性 list/get 解析任务后继续；多候选时要求明确指代，不盲选最近任务。任务卡详情可明确提交补充，冲突保留草稿、重试复用请求标识。失败/取消/中断仍要求显式 retry。
- 用户在已完成任务执行会话内直接继续发言时，也登记同任务新一轮；接待会话新话题不改变旧任务。8 秒卡片回收继续保持。

## 验证命令、结果及证据层级

基线相关 50/50。首轮全仓 397/399，两处旧断言仍期望 7 个工具；更新为包含 continue 的 8 个后集中复测。定向覆盖 CAS/幂等、排队、恢复、真实 Session/HTTP、多回合及员工聚合；其余验证记录在 `evidence/bot-task-continuity/VERIFICATION.txt`。

## 未完成项与下一步

进行中：模块集中复测、真实壳交互、副本回滚、普通合并后仅在 running=0 时加载需要重启的后端增量，并做真实模型续办验收。功能切片计数 1。该模块不是企业登录/员工长期记忆迁移，不改安装 EXE。
