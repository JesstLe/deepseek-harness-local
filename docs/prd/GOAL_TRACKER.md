# 总目标：Naumi 数字员工完整交付

## 2026-11-18 当前交付核对

当前以DAILY_EMPLOYEE_PRIORITY的D1–D5为准：Naumi0.3.7公开Latest，固定产品main3897fba。810业务回归、42安装/更新模块、隔离真实工作/主动/故障、原生文件单一路径、真实NSIS安装升级卸载/数据保留、匿名下载和真实0.3.6默认源ready已分别留证。参见../implementation/DAILY_EMPLOYEE_ACCEPTANCE_AUDIT.md；源代码/Git/Goal最终收口以FINAL_REOPEN及工具状态为准。下文M阶段active/待办为历史快照，不覆盖本节；企业冻结事项保留后置，不标成完成。


## 当前优先级覆盖（2026-11-17）

用户已确认：**先完成日常使用、主动性与可靠执行、员工连续性、工作与交付，再做企业相关模块。企业模块保持当前现状。**

当前实施以 [日常数字员工交付计划](DAILY_EMPLOYEE_PRIORITY.md) D1–D5 为准；下文原 M1–M5 编号与验收历史保留，原顺序不再作为企业前置依赖。复用已有本地能力，企业组织/共享同步/集中授权网关等不新增、不迁移、不启用。用户已要求继续推进；旧暂停目标经用户确认清除后，新日常目标已由 create_goal 建立并由 get_goal 核验 active。


建立日期：2026-11-16。执行决策：日常优先，用户已要求继续；系统 Goal 已重建并实查 active。实施模型：GPT-6.1 Sol。

本文件对应用户明确提出的“制定目标完整推进”，不把单个阶段交付当成总目标完成。

## 阶段与退出门槛

- M1 本地员工连续性：已实现并本地接入，156 项回归、真实跨会话记忆与回滚已验证。
- M2 员工中心、目标、交付验收：本地模块已实现，166 项回归和 20 项界面操作通过；实际页面/接口已接入。文本版本与 local-owner 验收已验证，企业资产/组织审批权威将在 M3 接入。
- M3 企业组织、共享记忆、同步、离线授权：核心已实现并接入本地实际服务；206 项企业端/166 项 Harness 回归与双设备故障链通过。MEM-007 已补齐确定性预览/精确合并/过期整理/候选导入；企业任务/私有资产/原生审核验收桥已接入，214 企业端与178 Harness 回归通过；local-owner 与企业验收保持分离。
- M4 主动规则、能力、预算、模型通道与分布式归属：执行归属/设备绑定/租约/fencing 模块已接入；223 企业端/183 Harness/18 UI、真实双设备过期/旧代次验证通过。能力清单/进展观察/确定性主动规则已接入实际3080，197项回归/12 UI/真实硬杀恢复/副本回滚通过；受管会话全局步骤/模型/工具门已接入实际3080，212项回归/8 UI/硬杀UNKNOWN/20项副本回滚通过；权威预算、独立模型通道与受控AI主动执行继续。
- M5 桌面安装包：待最终集成；logo、预装插件、首次登录、升级/迁移/回滚与安装验收。

## 执行规则

1. 保护其他工作树及运行版未提交改动；只同步已核验的增量文件。
2. 每个完整模块后集中测试；进度写回实现记录与验收矩阵。
3. 当前交付范围与退出条件以 DAILY_EMPLOYEE_PRIORITY.md 为准；系统 Goal 状态以工具实查为准，不以历史 active 描述替代。企业能力保持现状，不作为本期完成门槛。
4. 本机验收、服务端部署与员工使用验收分别记录；不以代码已提交代替上线。

## 历史接续（当前执行改按上方 D1–D5）

M3 核心已接入实际 naumi-design-ops（3112），不是旧 naumi-co；详见 docs/implementation/EMPLOYEE_SYNC_M3.md。当前真实设备未登记、上传关闭。MEM-007 与原生企业工作桥已接入，详见 ENTERPRISE_WORK_BRIDGE.md。M4 执行归属模块已接入，详见 EXECUTION_LEASES_M4.md。能力/运行观察/本地主动规则详见 EMPLOYEE_ACTIVITY_M4.md；受管运行门详见 EMPLOYEE_RUNTIME_GATE_M4.md；下一权威预算/独立模型通道/受控AI主动执行，再 M5 安装包；总目标 active。

## M4 企业模型与预算增量

独立模型网关、签名短期设备凭证、企业/员工/Bot/任务权威预留与真实usage结算、UNKNOWN上界核对、受管会话模型准入和模型管理UI已实现。230 Harness/桌面、233企业端、10 UI与独立进程强杀/重放0已通过。接入及副本回滚证据见 evidence/model-gateway；详见 EMPLOYEE_MODEL_GATEWAY_M4.md。真实供应商路由与负责人预算启用不以空路由health代替，受控主动AI与M5继续，总目标active。

## M4 受控主动 AI 增量

owner确认的run_agent规则、原子持久队列、原AgentLoop/Native工具消费、精确turn/网关UUID/不可变产物、人工输入抢占、请求/时长/工作窗口上限与UNKNOWN恢复/核对已实现并接入实际3080。251 Harness/桌面、233企业端、11 UI、真实SIGKILL及53项副本基线回归通过；7插件增量、其他hash不变。真实AI规则启用0、设备未登记、网关真实路由0。详见 EMPLOYEE_PROACTIVE_AI_M4.md 与 evidence/proactive-ai/VERIFICATION.txt；下一M5安装包完整集成及真实模型/员工使用验收，总目标active。

## M5.1 正式包完整性与钉钉预装增量

修复正式npm包漏M4运行模块与直接peer声明，增加AST/实物pack/import闭包；内置官方dingtalk-workspace-cli 1.0.68固定完整性/许可证、员工独立配置与可写原生缓存、无开发PATH launcher、真实readonly能力观察和Naumi技能。staging逐文件hash/私有状态路径扫描，默认build重stage，beforePack拒绝陈旧/追加/损坏资源。268项本地回归及251项副本回滚通过，实际3080仍62sessions/0running/3bots/revision10，没有接入或改员工数据。本模块的正式包与unpacked桌面构建/启动证据在evidence/employee-package持续记录，详见EMPLOYEE_PACKAGING_M5.md。

下一M5.2：profile实例与端口隔离、受管依赖junction升级、可配置远程企业首次登录/session桥、数据迁移/版本回退；随后NSIS干净安装/升级/卸载、员工授权与真实业务验收。总目标active，不以unpacked启动代替安装验收，不以本地CLI已内置代替企业授权或真实模型路由。

## M5.2 实例与依赖生命周期验收增量

独立实例HMAC/持久回执/端口竞争处理、真实引导URL就绪、私有默认工作区注册、受管junction事务/4阶段硬退出恢复、Windows独立worker及认证退出/重入门已实现。293项回归、268项副本恢复、正式npm包72文件、打包ASAR/resource源码一致性通过；真实双profile/native浏览器、正常重启、Electron主进程SIGKILL后原worker PID接回、正常退出及persona/memory/schema1保留通过。详见DESKTOP_LIFECYCLE_M5_2.md及evidence/desktop-lifecycle/VERIFICATION.txt。

下一M5.3：远程企业首次连接/session桥、endpoint/home归属边界与首次能力刷新；再业务数据/安装版本迁移回退、NSIS实际安装升级卸载、签名/依赖审查和真实员工/供应商使用。当前实际3080仍原服务，本增量不自动注册或启用员工。总目标active。

## M5.3 企业首次连接/session桥增量

实例协议2绑定真实监听端口、规范home和企业origin；identity v1增量补homeHash并保留UUID/key，克隆/搬迁拒绝隐式复用。standalone新增浅色首次连接页与持久企业origin配置、独立企业session登录窗口和固定业务API桥；不复制Cookie到renderer/backend。catalog/manager/enroll/bind复用该桥，原设备签名通道/RBAC/私人同步确认不变。首次GUI桥出现时刷新能力；DPAPI采用绝对系统PowerShell；Windows回执原子rename加入有界handoff重试。315项集中回归通过，正式npm包73文件；最终桌面/产物/副本回滚结果见evidence/desktop-enterprise/VERIFICATION.txt，详见DESKTOP_ENTERPRISE_M5_3.md。

下一M5.4：首次连接错误地址/不可达的修复UI、NSIS真实安装/升级/卸载、已安装版本/业务schema迁移回退与Windows数据handoff；再签名/依赖、真实HTTPS企业/员工登记绑定/供应商与业务验收。企业切换/目录搬迁需要显式迁移流程，不隐式继承旧issuer/设备/cache。整体目标active。

## M5.4 企业工作区与 NSIS 正常停机链

首次连接新增匿名固定接口检查、错误/取消不落盘、启动错误/系统连接修复入口；已有单企业home兼容保留。不同企业采用独立UUID home/设备/SQLite/浏览器namespace，不重写旧issuer；切换前检查真实owner会话与桥操作，认证停止旧worker后选择active，返回旧工作区恢复原数据。企业不可达仍可启动已有本地工作台。333项模块回归通过。

桌面候选0.2.1，实际0.2.0基线NSIS已构建；0.2.1安装/正常停机升级/旧单企业profile降级/卸载的实际结果统一见evidence/desktop-installation/VERIFICATION.txt、WORKSPACE_RECOVERY.json和NSIS_INSTALLATION.json。完整记录见DESKTOP_INSTALLATION_M5_4.md。不把缺失或非PASS结果算验收完成。

卸载观察超时的原命令exit1保留，独立只读复核exit0确认最终清理与数据保留；NSIS_INSTALLATION.json明确reconciledAfterObserverTimeout。观察器增加单次启动、300秒后置状态等待与持久checkpoint；4项回归通过，修订runner完整真机链未重跑。

下一M5.5：安装器认证quiesce、硬杀遗留worker/运行中任务/句柄与失败恢复；新企业工作区回退旧客户端的兼容阻止/恢复；随后业务schema矩阵、干净员工机/真实HTTPS账号/供应商预算与真实业务验收、签名和依赖审查。总目标active。

## 员工能力隐式化交互增量

按用户确认隐藏默认员工中心，把日常操作融入Bot菜单；保留后台记忆/人设/心跳与权限/预算边界。新增原子遗忘（记忆与精确匹配偏好字段）、显式遗忘指令、可见习惯恢复和角色驱动的按需高级展示。源码/模块验证与实际运行加载分开记录，结果以evidence/employee-experience/VERIFICATION.txt为准。协作线程保留文件卡片/结构化产物和bot-task*归属。本增量不关闭设备/模型/员工业务与安装故障验收。

## 日常自然目标提议 D3 增量

真实用户消息可经原生工具形成待确认目标；用户可编辑确认或忽略，来源/幂等/CAS/事务保持，未确认不进入执行。详见NATURAL_WORK_GOALS.md及evidence/natural-work-goals。Goal保持active；本地提议和确认不等于任务派发、供应商验收、安装交付或企业授权。
