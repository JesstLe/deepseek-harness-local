# D3 已确认目标与原生任务/交付关联

模块与职责：主线程接续目标—派单—员工提交—owner验收闭环，基线3c2373c42a3e3c86baa44318bedb9ed0b80bf242；独立codex/work-goal-task-links，E:/Workspace/naumi-work-goal-task-links。原bot-task*负责人已工具确认移交，保留snapshot/deliveryHistory和继续/重试归档。企业模块保持现状。

公共接口/状态归属：bot_dispatch可引用调用者Bot已确认的workGoalId+workGoalRevision；任务JSON保存不可变目标快照。原EmployeeWorkStore（同employees.sqlite）保存源目标owner的交付，受托员工只有精确targetSession与sourceTaskId可提交。目标确认≠派单，任务completed≠交付accepted。原BotTaskStore/AgentLoop/原输入器与模型/权限保留，无平行执行器。

依赖方向：installBots用员工onReady得到同一个EmployeeStore的工作读取器，作为可选readWorkGoal传给原任务服务，不另建SQLite连接/缓存。同步最终准入再次核对目标状态/版本与依赖；JSON与SQLite不是分布式事务，不宣称跨库原子提交，任务引用持久化在原JSON，业务交付事务仍在原SQLite。

本次实现：开发中。只分享显式派单所绑定的目标快照、精确任务交付；不让目标员工读取源员工完整记忆/所有目标。原接待会话和其他任务无写权限。目标更新后旧引用拒绝新执行/新交付，原发送会话显式刷新相同目标版本后继续/重试同任务，保留最初快照与更新历史。

文件归属：bot-task-service/store/tasks、bot-task-handoff、bots仅读取器注入、employee-work、employee-work-store最小公共扩展、center/model与experience只接原生打开任务回调；对应测试/隔离runner/证据和PRD。不改bot-file-versions/工作区迁移/模型权限/企业/安装器。

验证命令/结果：基线node --test tests/naumi-employee-work.test.mjs tests/naumi-bot-tasks.test.mjs tests/naumi-bot-task-continuity.test.mjs，23/23 exit0。完整模块后集中验证跨Bot/精确Session/CAS/幂等/目标暂停及改变/同任务修订/产物版本/owner审核/恢复。
未完成：实现、集中验收、四项副本回滚/主线/空闲加载；Codex/Claude导入与最终包含全部切片安装/更新分发继续。0.3.6为既有候选，不包含本开发切片。

当前实现与取舍：真实共享TaskCard通过可选currentWorkGoal/onTaskChanged扩展使用，不复制输入器/卡片状态。目标内容变化时显式勾选采用当前要求，状态由planned→in_progress不伪造版本冲突；暂停/关闭和依赖仍生效。请求回包丢失后保留原idempotencyKey及已确认goal revision，列表刷新不会制造第三次执行。每版artifact和review保存当时验收条件，原内容/旧条件可核验。复盘仅形成执行员工候选，须owner确认后才供下个任务检索，不自动变成源主管私有记忆。

启动/恢复：共用员工store未就绪时，带目标任务留在原queued队列；员工onReady通知原消费器，不建立新调度器。新workGoal/updates为原任务schema的可选字段；旧严格读取器不兼容这些新字段，源码副本回滚不是在线数据降级。真实加载失败若任务/员工数据已有新写入，保留兼容读取器，不用旧源码覆盖新业务账本。

验证进度：基线23/23；初轮新旧模块32/32，后补启动就绪/同Bot其他任务拒绝后34/34；初次全仓749/749。原生壳初次因版本链接带校验码不适合精确文本定位而退出，失败保留；修正后13/13原生链路通过，覆盖同任务attempt2、旧文件/旧条件、owner验收及原生打开任务。现补回包丢失+投影刷新幂等后集中最终验证。

主线整合3c2373c→aa33222，.gitattributes双方证据追加保留；不改peer安装器修复。两次原生壳分别13项和含回包丢失的15项通过，最终1360/360图片已打开检查；交付执行状态复用原taskLabel中文映射。原包在冲突未解期间生成的记录不作为最终归档，解决冲突后重新打包及副本恢复。目标暂停只阻止本关联链的新派单/待发送消息/新交付，不擅自回滚已执行工具或取消其他原生工作；停止任务仍用原TaskCard明确停止。
