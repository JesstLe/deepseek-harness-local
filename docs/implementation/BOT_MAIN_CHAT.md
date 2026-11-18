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

- 最终原生UI固定树17项通过，另验证真实子线程点击打开历史。整合dd764f7后固定f8e651a全仓828/828，exit0；上游新增6项均保留。.gitattributes仅尾部双追加冲突，保留双方规则。
- 四件套原件/修改件15源文件SHA/ZIP CRC/可执行rollback重开通过；另一标记源码副本恢复15路径，原六模块46/46，exit0；当前修改保持。首次archive stdout超maxBuffer已留证，改用git archive --output而非提高缓冲。
- 收到对方3080与共享Git窗口释放；下一步普通merge/push再10文件短停加载，保护5个presentation增量。

## 首次真实加载保护门与修正
- main47b80a4 prepare10通过。初次PowerShell包装读取了Stop脚本遗留LASTEXITCODE，Stop已执行但包装提前退出，未写源码；后续正确续接。
- 10文件apply后HTTP200/PID26356，但员工库整库hash门遇employee_activity_clock启动时更新而失败；自动恢复10原文件并启动PID45992，原失败保留，不计加载通过。四个员工export核验保持。
- 源码employee-activity-store.js第71–73行表明该表为既有防时钟回拨高水位；只将该运行时表单独记录并验证单调，entities/events/operations及其余3库完整hash继续要求不变。无员工代码变更、数据回写或规则启用。

## 实际加载收口
- 正式功能main47b80a4，部署校验修正main d1bbfbe82facadc6cfcba6a80b5fce7b2528bab7；第二轮10文件增量exit0，PID46840/HTTP200/X-Naumi-Bot-Main-Chat=1。106sessions/0running/4bots/catalog47。
- 145无关运行文件和117权威文件原hash保持；4个SQLite库业务表、模型、四员工export、任务、群及44其他证据前缀保持。employee_activity_clock由1794965908863增加至1794965948743单独记录，不当作业务写入。
- host/client/package/product-version/desktop-updates两资产及已修快捷方式均未触碰；公开0.3.7不重建、不改版。0真实供应商/真实任务/规则/迁移/企业变更。
- 已工具通知释放3080，此后不再重启；最后仅证据、主线产物重开、清理本任务worktree。

## 实际UI与最终原数据核验
- 额外实际3080导航19项通过，4 Bot逐一点击验证原生DOM的data-conversation-session=各自home，任务次入口常显、任务页返回主聊天，106会话不增加，0prompt/cancel/任务写入、0页面异常。启动原生session/create仅恢复已有同ID空会话，不新增身份。
- 验收脚本前几轮错误使用折叠的右侧团队DOM/未就绪页面作断言，以及把原生空会话恢复当作新建；保留失败日志，最终用原生会话DOM与返回ID验证。不是产品改动。
- 导航后的严格部署全hash重开按设计拒绝一份正常追加的session；另有既有activity_observation入库。没有重启/回滚/数据写回。专用POST_UI对原压缩帧逐边界找SHA：116文件原hash保持；1份session原413字节前缀保持，追加80字节仅session/end-seed空数据。employees库仅新event seq170/activity_observation revision1与对应实体/observe操作；在只读内存投影去掉这三个追加行后，整个旧库业务行聚合hash精确匹配加载前值。原行未改，其他三库整表hash保持，四员工export/任务/群/模型保持。该观测不是新业务目标、规则或模型调用。
- POST_UI_FINAL.log: MAIN_CHAT_POST_UI_PASS exact_files=116 session_prefixes=1 sessions=106 running=0 original_employee_rows=PASS activity_appends=1 prompts=0，exit0。不再笼统声称导航后117份文件整hash或4库全表hash不变。
- 本切片功能、Git、实际加载与导航验收均完成；最终只收口证据及清理自有worktree，不发布新的EXE。
