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

已完成：模块 400/400；整合主线 418/418，头像等后续主线 426/426，压缩兼容最终 430/430，收尾再对最新主线集中验证。16 项受控真实壳交互、12 项无 mock 已加载页面通过，0 page errors。实际模型自主 dispatch 一次、continue 一次，同 task/Session 执行两轮（attempt=2），两条测试 Session 归档，无重复任务。

加载源 main `23e0e03` 的 3 后端＋7 UI，68 个无关文件保留；随后仅两个前端导航 delta 兼容运行壳缺少 beginNavigation，保留已加载头像。用户截图暴露旧官方模型已退役但压缩仍走旧 request header 的问题：`e089a7a` 修复摘要 hook，只在旧官方适配器缺失、Session 明确选中新可用模型时切换摘要路由，不改历史 header/原始正文，不重开官方登录。真实 BasicCompactionEngine 测试及受影响主管 Session 的 fork 副本实跑压缩成功，副本只回复固定标记、0工具调用并归档。

用户明确同意迁到 CC · DeepSeek/deepseek-flash 后，通过原生 selectModel 更新 3 个 Bot home 和 14 个仍指向旧官方 flash 的会话；保留历史与文件，不操作正在运行的会话。自定义协议不支持旧 high 枚举，采用 adapter 默认。8组连接/URL/API Key 的哈希保持，Bot目录不变。原失败任务保留真实 failed，不自动重新执行。

供应商切换验证最初 NO_ADAPTER 无任务产生；随后模型把“续办验收”误解为查历史且旧 list 返回过大，已改为紧凑分页摘要，详细结果仍走 get。误读旧RPC调用缺省参数导致的 gateway/internal 与真实迁移问题分开记录。首次旧任务副本不需要压缩，不能冒充压缩通过；第二份来自实际截图报错的主管 Session，确实触发压缩并完成。各失败记录不计入成功。

同步：`c1fe9f0`→`9a730ed`→`a332d0e`→`19373d1`→`d5033d4`→`6805154`→品牌主线；功能切片计数 1。只增补压缩 peer，保留模型连接、发现、头像和品牌 files/host/client。最终只读 76 sessions/0 running/3 bots；2成功联调Session、2失败测试Session及2旧上下文副本均已归档，原用户任务不删除。重启/模型窗口已通过工具明确释放，后续仅证据与Git收尾。完整角色设计、企业登录迁移、安装EXE不属于本切片。
