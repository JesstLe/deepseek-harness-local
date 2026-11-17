# 本地主动执行：共享消费器的 local-owner 策略

模块与职责：本线程负责D4本地策略，不复制调度器、AgentLoop、工具执行器或权限系统。基线 main/origin/main 406277c1c6f3f892b5c2218911971927e8cef4d1；独立分支 codex/local-proactive-execution，worktree E:/Workspace/naumi-local-proactive-execution。功能切片计数1。

文件归属：employee-proactive-ai.js、employee-activity-store.js、新增employee-local-proactive.js、原活动/日常工作组件、package仅追加该模块、对应测试/隔离runner、文档与本任务证据。企业sync/model/runtime/权限模块、host/client、原生输入器、模型位置、插件市场、IM、模型思考档位均不改。共享checkout已有其他任务未跟踪证据保留。

## 公共接口与归属

- 新action.kind=run_local_agent；严格schema包含当前Bot根Session、目标、原provider/model/可选显式reasoning、指令、模型请求/运行时长/工具次数上限和精确工具清单。不接tenant/device/taskId/token/apikey或权限修改。
- EmployeeActivityStore继续拥有规则、批准nonce、窗口/冷却/累计次数、occurrence唯一收据、原子队列与时钟高水位；两个AI action共用proactive_ai与原消费器。
- LocalProactivePolicy只做本地准入、模型/工具回执、核对，不注册模型适配器或创建Session。模型和权限始终沿用原Session；只恢复既有Bot根会话。企业managed绑定或naumi-enterprise provider拒绝以local模式运行，原企业策略分支保持原授权/预算/回执。
- 本地可批准工具限定真实注册的员工记忆读取/工作/交付/观察与原生str_replace_editor；不添加shell、独立派单/调度/创建员工或企业审批旁路。原工具审批和工作区策略继续执行，本模块不是OS沙箱。
- SQLite仍employees.sqlite schema1；新增local_proactive_model/tool实体和按Bot/type/jobId查询索引，不迁移旧目录、任务、人格、记忆或企业数据。每次模型请求的UUID/次数与running回执同事务先落盘；工具调用同样先留精确callId，不保存工具参数/正文/密钥。
- 模型输出来自原native流，不改冻结options、不用已废弃agent/request、不重选模型/思考档位。请求失败通过原agent/request-error停止本轮本地主动重试；正常手工会话/企业请求不受影响。

## 使用体验

工作与交付里直接配置主动工作；复用原RuleForm、ActivityPanel及HTTP。普通模式隐藏设备/网关/预算/心跳/Session ID/原始回执。间隔以分钟输入、工作时区用系统值、创建停用并由用户另行确认启用；编辑撤销旧批准。完成产物后原工作列表刷新，不另建展示账本。

本地规则使用现有窗口、冷却、累计次数、单会话串行、最多四个消费器、原生输入抢占、最长24小时队列有效期、单规则未结束项限制。心跳和无事项不调用模型，休眠只取最新一次，不重放整段历史。

## 可靠性与回执

- 自己正在执行的工具回执不当作前一次遗留UNKNOWN；当前inflight与持久回执分别核验。
- 模型断流、工具含糊结果、执行中撤销/强杀、回执写入失败保持UNKNOWN，冻结该会话后续主动消费，不发新attempt掩盖。
- owner确认已核对停止后，在同一CAS事务记录原回执resolution与job reviewed_stopped；原unknown和usage未知状态不伪造成completed，不自动重新执行，不退款。
- 记录供应商返回的input/output usage；缺usage显示unknown。没有企业网关的BYO本地路径不宣称权威计费或实际金额，次数/时长/工具上限由程序执行。
- 工具清单与更严的旧上限在表单编辑时保留，不因改标题自动扩大。原模型选择变化会阻止规则，不自动切换更贵路由。

## 验证命令与层级

修改前原主动/活动35/35。首轮新旧合跑45/47，两个旧轻量fixture未提供schemas导致只读view失败；已改为缺少真实guard/schemas时local能力明确不可用，旧确定性规则仍可读可用，后续47/47。新增边界与最终全仓、独立实际Harness/原PiAiAdapter/Native工具UI、真实子进程强杀、副本回滚、运行加载以evidence/local-proactive/VERIFICATION.txt实际记录为准。

本地协议fixture不是收费供应商自然语言自主决策验收；测试Session/账号/工作区与真实3080数据隔离。

## 迁移与剩余

旧企业action、已有记录与开关不改，新增本地规则默认不自动启用。旧严格/分支读取器不认识run_local_agent；源码副本回滚不是在线数据降级，旧版运行前须停用并保留新规则兼容读取，或经确认恢复无新业务写入快照，禁止删除记录装作兼容。

本切片不关闭D2身份/历史工作区迁移、D3自然目标确认/跨Bot目标与任务关联/二进制固定版本、真实供应商验收和D5最终安装/更新分发。Goal当前active，企业模块保持现状。

D1运行接续：4静态资源已从main406277c加载，HTTP200/117无关文件hash保持/无重启。D4首轮完整回归684/685，唯一失败为未改动的desktop backend测试临时目录清理EPERM；同名定向复测1/1通过，原失败保留，不把它算全仓通过。最终整合后集中复测另记。独立壳最终16项通过，2次loopback原PiAiAdapter请求，0真实供应商/企业登记；SIGKILL恢复UNKNOWN与不重放、owner核对通过。首次强杀观察器把signalCode已结束误判exitCode仍null，最终等待已修正，初次exit13与最终exit0分别留证。

整合主线406277c→ba4ee2a（模型审计最终证据与暂缓的常驻自主Bot愿景保留），功能计数1。node --test --test-concurrency=4 tests/*.test.mjs desktop/tests/*.test.cjs：686/686，exit0；没有跳过测试，降低跨文件并发以避免Windows临时目录句柄争用。本地固定触发/明确批准工作不是BOT-AUTONOMY-001长期自主规划，该愿景仍暂缓。
