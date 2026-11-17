# 日常工作与交付入口 D1

模块与职责：复用 employee-center 的真实工作组件、状态、目标/交付表单和 CAS/owner API，以 workOnly 组合给普通用户一个轻量入口。企业端保持现状；不新增第二套工作账本或验收状态机。

公共接口、依赖与状态归属：Bot菜单 → employee-experience 的 work 事件 → createEmployeeCenter({workOnly:true, initialBotId})。GET/POST /naumi/employee-work、原 employees.sqlite 与原版本审核逻辑不变。普通工作页只查询所选 Bot 的工作，不查询档案/心跳/成长或调用企业工作、设备、同步、运行和预算API；管理员原高级入口保留原角色检查。

本次实现：Bot菜单工作与交付、目标创建/编辑/状态、不可变文本版本和下载校验、提交/退回/逐项验收、关闭/焦点边界、窄屏。单 Bot 组合不显示员工中心导航/员工列表/企业页/运行参数。既有原生会话、输入器、派单、模型位置均不修改。共享 Center 的高级模式保留原行为，没有复制表单和审核生命周期。

负责人：本线程；分支 codex/daily-employee-priority；基线 e620bd982b77bac92d2dc820c83ae2255658d682。功能切片计数1；PRD优先级更新计数0。文件范围：4个员工前端资产、对应测试、隔离UI runner、docs/prd与本文、evidence/daily-work。不修改host/client/package、企业模块、模型、运行配置或真实员工数据。

验证命令与层级：基线定向22/22；新增后25/25、集中全仓602/602；隔离真实Harness壳/SQLite/owner HTTP链路18项。最终结果见 evidence/daily-work/VERIFICATION.txt。UI验证不发供应商请求，不对3080业务写入；源码副本回滚不降级真实数据库。

未完成项与下一步：D1不等于D2–D5完整交付。自然语言建立/确认目标、派单关联、任意二进制交付固定版本、旧工作区迁移、本地主动AI分域、故障恢复和最新安装包继续实施；当前只复用已支持的不可变文本交付，不把原生文件卡引用冒充固定快照。运行加载和安装包发布分别记证，不因源码测试通过写成上线。

集中壳复测发现原组件409后自动刷新会清除刚显示的错误，导致冲突反馈竞态；已改为刷新当前数据后再保留冲突提示，草稿和旧revision不自动覆盖。原失败日志保留为UI_CONFLICT_FAILURE。

新增日常弹窗在Escape关闭后明确恢复Bot菜单按钮焦点；不依赖可能已移除的菜单项或body作为焦点目标。修改后定向壳复测结果单独记录。
