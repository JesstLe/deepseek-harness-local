# 日常员工连续性 D2

模块与职责：主线程负责当前员工的身份/记忆/人物设定/明确遗忘跨会话、模型和重启的隔离验收与实际缺口修复。基线def82a3（接续46a0dc6，仅其他线程Cloud47部署脚本增量），独立codex/employee-continuity-acceptance，E:/Workspace/naumi-employee-continuity。企业模块保持不变；其他线程继续负责历史工作区迁移/总览/固定文件版本。

公共接口/依赖/状态归属：沿用BotDirectory、原SessionController、EmployeeService来源校验、EmployeeStore及原生工具/模型；不新增身份、记忆、任务或执行账本。只在原active记忆读取投影中过滤已被当前档案替换的历史赋值，原记录/版本/来源保留，不改schema、不迁移、不自动共享。

调研与实际缺口：baseline真实EmployeeStore依次学习“以后回复先给结论”和“以后回复详细解释”，档案已为详细解释，但active检索和系统上下文仍同时包含两条相斥的字段赋值。旧人物设定候选确认后再被用户更改，也可能以active记忆重新注入旧值。基线原模块30/30并未覆盖这类冲突。

本次实现：原memories/context投影以当前profile为权威；只有具有真实user来源和精确支持语法的旧字段赋值、或已确认但与当前profile不一致的人设候选被排除，手动普通偏好不受影响。全部状态查询保留原记录并标effective=false，原高级表单标签显示已替换。当前生效记录仍沿原scope/过期/排序/数量/转义规则；不改模型位置/权限/企业sync。

文件归属：employee-store.js、assets/employee-center.js单标签；连续性测试/隔离真实模型runner/打包与精确加载脚本、本文和PRD证据。

验证与证据层级：BASELINE.log 30/30；BASELINE_STALE_STYLE.log记录实际冲突，后续集中模块、实际原生宿主/模型与重启、导出与副本回滚分别留证。真实供应商凭据只读并仅通过子进程环境注入，不写入隔离home或证据。

未完成与下一步：集中测试与隔离真实供应商连续性；不对3080业务会话发测试，不因观察超时重放模型；完成后普通合并/空闲加载，D2历史工作区与D3任务/交付及D5安装仍独立退出。

集中验证进度：35/35模块（5个新连续性用例+原30）exit0；9路径源码包ZIP CRC/原始哈希、4原文件恢复/5新增删除、副本原30/30通过。全仓首轮因本工作树漏desktop/node_modules junction导致installer/electron依赖缺失，完整失败保留；已补与主仓库相同依赖junction后集中复测，不改业务代码或跳过测试。真实供应商隔离验收已有新会话检索/人设候选确认/双模型/同数据宿主重启记录；未结束前不计整条PASS。

## 验收矩阵（已观察证据）
| 要求 | 结果 | 证据 |
| --- | --- | --- |
| 新会话仍为同员工/记忆 | PASS；新Session绑定同Bot，未在新prompt泄露标记而检索并返回 | LIVE_VERIFICATION fresh_session_native_search |
| 模型切换保持人设/记忆 | PASS；原生selectModel deepseek-flash→deepseek-v4-pro，工具回读确认人设与标记 | second_model_recall |
| 宿主重启保持连续 | PASS；停止同隔离宿主后重开同home/port，export除exportedAt完全相等，同Session真实模型检索 | restart checks |
| 人设随会话演变须确认 | PASS；真实profile_propose候选不注入，owner确认后新模型读取 | persona checks |
| 临时要求不污染 | PASS；“这次回复简洁直接”前后export除时间完全一致 | temporary check |
| 遗忘不再注入 | PASS；owner原子遗忘后全新Session检索不再返回随机标记 | forgotten check |
| 员工私有记忆隔离 | PASS；独立Bot原生工具无前员工标记/人设 | other_employee check |
| 不借权限/不改模型 | PASS；4个实际持久Session的12个原生权限/sandbox/approval事件，仅employee工具；同Bot3Session策略逐项一致 | NATIVE_POLICIES.json |
| 旧风格/人设不再冲突 | PASS；35/35模块，旧记录未改/导出保留/当前字段权威/重开 | MODULE.log |
| 历史物理工作区迁移 | 协作线程daily-five负责，不由上述记忆验收代替 | DAILY_FIVE_CLOSEOUT.md |

真实链路：13检查、10完整原生回合、22供应商请求、2宿主启动；不是loopback假模型。只使用既有选定分组的deepseek-flash与同组已配置deepseek-v4-pro，密钥只在环境/内存，不写fixture；原3组配置/凭据文件hash保持，0次3080请求。企业状态不变。两个隔离宿主已结束，没有新建生产员工或修改业务会话。

主线同步def82a3→b65d506→8734f5a，保留daily-five三模块/0.3.6候选版本，未写协作文件。整合后全仓738/738、exit0，原主线728/728通过也保留；35模块、30副本回滚均exit0。旧风格冲突baseline可复现；副本恢复旧行为仍保留两条style并通过原30测试，当前源码保持修复。功能切片1。
