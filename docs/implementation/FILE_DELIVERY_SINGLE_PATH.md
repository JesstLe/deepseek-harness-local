# 文件任务单一路径交付（2026-11-18）

模块与职责：本线程独占 employee-work.js / employee-work-store.js、相关文件验收测试及本切片脚本/文档/证据。基线 main/origin/main 81d474723e3ad46a74e4f6e3e5a7b96590cd3e6c；分支 codex/file-delivery-single-path-20261118，独立工作树 E:/Workspace/naumi-file-delivery-single-path。企业、模型、UI图标/导航/原输入器、package、任务执行器和真实业务数据不改。

调研：上轮真实模型完成文件任务时，又调用 inline-text create/revise/submit 建立3个文本artifact；原生文件集合与人工审核正确，但两条交付路径产生重复。原提示文字不足以作为约束。现有文件任务已由 EmployeeTaskFiles 订阅原任务账本并登记文件集合，本模块复用它，不增加执行/审批/交付账本。

公共接口、依赖方向、数据/状态/事务归属：assignedWork增加原账本output及deliveryPath(native_present/inline_text)投影；原create/revise/submit工具说明明确适用路径。EmployeeWorkStore沿用原mutate，在新写事务内增加可选validate callback，放在原operation收据检查之后；业务服务按原任务output决定拒绝文件任务的新inline-text写入，错误WORK_TASK_FILES_USE_PRESENT。文件present和自动待审路径、文本任务及独立主动草稿均走原实现。

兼容：不删除、不隐藏、不迁移既有text delivery/artifact/review。旧成功operation同payload仍返回原收据（create/revise/submit覆盖），不同payload仍冲突；新操作被拒绝且不写operations/events/artifact。Owner仍可明确追加文字说明、审核既有记录；代理不因错误获得owner权限。验证回调不进入原digest，因此旧收据可重试。

本次实现：2个后端模块最小扩展；现有文本来源测试改为真正text任务，保留原provenance验证；新增6项文件拒绝/原生二进制成功/历史收据重试/历史记录与owner控制/文本任务与本地主动草稿兼容。基线repro实证file task可生成inline draft；modified拒绝且0副作用。模块49/49通过；初次工具execute为异步，测试误用assert.throws，改为await assert.rejects，原失败日志保留。

验证命令与层级：node scripts/repro-file-delivery-single-path.mjs --baseline / --modified（本机原生Session/Store与确定性驱动，不是收费模型）；node --test tests/naumi-file-delivery-single-path.test.mjs tests/naumi-work-file-acceptance.test.mjs tests/naumi-work-goal-task-links.test.mjs tests/naumi-local-proactive.test.mjs，49/49 exit0。真实模型独立随机端口/home/Bot/CSV，复用现有选中连接，最多48入口/输出4096/上游单请求120秒，不调用真实3080写API，不自动批准权限升级。无自动重发业务。

未完成项：本轮真实模型双版本且仅1份files交付/0text draft实测、全仓回归、源码副本回滚/四件套、普通main及必要加载；随后固定最新main的安装更新交付。整个Goal继续active，企业保持现状。

全仓810/810、0skip、exit0。首个live在文件执行前由模型发起原生ask_user_question确认，runner记input-required并未代答/批准，3入口保留；没有派单或文件写入。本模块定向实测改由owner API直接创建已确认Goal，再让真实主管派单/员工生成与原task返工，不重复上轮已通过的自然提议全链；整体Goal范围不变。

实测最终通过：FILE_SINGLE_LIVE checks=9 boots=1 supplier_entry_requests=30 same_task=1 attempt=2 file_versions=2 deliveries=1 text_drafts=0 actual3080_writes=0 config_changes=0，exit0。原生公开记录重开29条持久assistant响应；30是入口计数，收费数未观察；两版CSV精确25/2760与31/3480、4文件字节/hash重开通过。首个3入口input-required用例保留，不算文件验收通过。待源码副本回滚/归档/主线及2文件加载；随后D5固定新main构建。
