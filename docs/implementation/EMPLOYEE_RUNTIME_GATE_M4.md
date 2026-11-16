# M4：受管任务执行准入

2026-11-16，GPT-6.1 Sol。基线 `837d795`。依赖既有企业签名授权、设备绑定、任务归属/租约/fencing、本地员工数据与原生 AgentLoop/Tools。

## 本模块实现

- `employee-runtime-policy.js`：严格 owner 命令及本地读/草稿/恢复工具分类；不同作用域的新根会话/调度不能绕过绑定。
- `employee-runtime-gate.js`：持久化 managed_session、managed_tool 收据、fork/团队继承、步骤/模型流/工具准入、租约续租、取消与UNKNOWN恢复。
- 员工中心 → 运行 → 执行准入：选择会话与企业任务、明确在线工具、离线本地开关、暂停/启用/调整/停止、结果核对。
- `EmployeeExecutionLeases.renew`：只续精确 attempt/fence，不在自动续租中创建新 attempt。`EmployeeSync.device/http` 转发取消信号。
- 企业 Agent 领取/交稿在 gate 已接入时要求同一 root/任务/attempt/fence；owner 网页原有领取/上传/验收仍走独立服务器权限。

## 绑定与生命周期

绑定是 local-owner 的运行限制，不是新的企业授权。身份来自有效签名设备包：tenant/member/device/employee/localBot；task须通过已签名 execution.inspect。根 Session 必须属于该 Bot，第一次绑定保持 paused。一个任务不得同时绑定多个本机执行根；已停止记录保留拒绝墓碑，不恢复为普通会话。

owner 控制使用 operationId/CAS。配置只在暂停且根/已知派生执行器静止后调整。启用取得真实租约，不唤醒模型、不重放旧输入。暂停/停止可在执行中生效；已启动外部工具按 UNKNOWN处理，不把取消信号当作物理停止证明。

managed_session 与工具收据先落 employees.sqlite。只存身份/策略/工具名/调用ID/状态，不记录工具参数、凭证或原始错误。grant仍由原设备vault加密保存在employee-sync.sqlite。规则/运行记录不加入私人档案记忆同步。

## 两种可执行模式

1. **online**：有效离线设备授权 + 当前Bot/账号绑定 + 精确设备/任务/attempt/fence的未到期租约。在线工具还必须在owner精确清单内；原sandbox、审批、服务端RBAC继续生效。
2. **local_only**：控制中心断开、租约失效或外部结果待核对时，若owner允许且签名包仍授予local.infer，本地推理可继续。工具只允许确定性分类的本员工本地读/草稿与恢复查询；没有把任意shell/browser/MCP标成“本地安全工具”。

签名包local.read/local.draft/local.infer分别核验；过期、撤权、账号/设备/Bot绑定改变时停止新推理和新动作，界面/历史保留。离线推理是否真正可用仍取决于原模型通道可达及凭证有效，独立网关仍是下一模块。

## 原生执行入口与程序传输

- `agent/pre-step` 前后检查；拒绝使用原生 blocked 结果，不伪造assistant完成或清空历史。
- `llm/stream` 在真实provider入口及chunk边界再检查；已开始的AgentLoop请求进入host观察器，许可撤销用 `hook` 原因取消，保留原收件箱，不假冒用户取消。
- `tools/pre-execute` 解决团队/fork父链，`ToolsService.guard` 作为审批后的单调拒绝，`tools/execute` 派发前再检查并跟踪外部调用。后续插件返回allow不能覆盖guard。
- **受管会话使用原生逐工具执行器**。研究确认原Node PTC运行器允许直接文件/网络/子进程操作，不只调用SDK，因此不能将run_code当作无副作用外壳。managed run_code明确拒绝；Native工具逐个检查。原模型选择、原权限不提升，普通未绑定会话保留原执行器。
- 真实团队成员及可追溯fork继承根绑定。独立bot_dispatch/身份变更/调度在受管任务内不用于逃逸；普通本机跨Bot协作保持。未来主动编排器须为不同企业子任务配置各自受管根，不能把临时成员冒充另一个员工。

## 到期、在途与重启

host默认1秒采样在途许可；只为正在运行的受管会话接近到期时续精确租约，重试至少5秒间隔，空闲不会为续租调用模型。网络故障不重置attempt；有效签名授权范围内降为local_only。

外部工具网络前先写running收据；许可丢失发出组合AbortSignal并等待工具实际settle。没有声称同进程协作取消能硬杀任意后台进程或使第三方API接受fencing。返回未知/异常、取消或重启残留均冻结外部执行，保留原attempt。重启将running工具记录与对应绑定原子改为UNKNOWN；不重新调用工具。

UNKNOWN会尝试签名上报服务端execution.uncertain，断线保留本地记录后续再报。解除要求：owner核对记录+confirmedStopped，以及服务器已明确释放原owner、fence推进；停止墓碑仍保持stopped。恢复执行是另一次明确owner动作，才允许在已释放后取得新attempt。

## 边界与后续

这是应用层准入，不是新OS沙箱；owner批准的任意命令仍受原运行器限制，已脱离运行器的第三方副作用仍需原回执/人工核对。不能以本机guard替代服务器fencing或独立网关权威预算。本模块不自动启用真实企业员工、触发业务操作或更换模型API Key。

下一步：权威预算/并发/重试与独立模型通道；之后接受控主动AI规则及多任务编排，最后M5带Logo/浏览器/桌面与钉钉CLI等插件的安装、升级、迁移和回滚。

## 验收记录

证据：`evidence/runtime-gate`。真实AgentLoop/LLM registry/Native Tool pipeline/Session JSONL/SQLite/签名HTTP故障测试、真实子进程硬杀、候选UI、实际3080只读接入与副本回滚分层记录；provider和业务域的fixture不冒充收费模型或企业生产验收。

```text
继续GPT-6.1 Sol数字员工完整目标。先读GOAL_TRACKER、EMPLOYEE_RUNTIME_GATE_M4、EMPLOYEE_ACTIVITY_M4、BOT_LOCAL_FIRST。已有受管root/团队/fork、签名离线本地模式、精确租约/单调工具guard、Native逐工具执行、UNKNOWN重启恢复；run_code不能绕过。下一实现服务端/独立网关权威预算、并发、重试、独立模型通道，再接受控主动AI与M5。保护3080/3112实际运行版其他增量，不全量sync；模块后集中验证/文档/四件套/选择性提交推送。总目标active。
```

### 本轮完成证据

- 全仓212/212，0 skipped，其中新增15项真实运行时准入验证；模型provider/业务domain是fixture，AgentLoop/Native pipeline/JSONL/SQLite/签名HTTP是真实实现。
- 8项UI操作，0 page errors；已打开复核1460px与680px布局，已绑定全部会话时不再显示空白绑定表单。
- 真实SIGKILL：外部工具启动并持久化后硬杀，独立重开后UNKNOWN、原attempt保留、外部重放0，本地读仍可用。
- 副本回滚恢复7旧文件、移除3新增文件；原员工与主动规则20/20通过，档案/记忆/主动规则历史保留，新版源码保持。
- 实际3080只增量部署10插件文件，其他插件hash0变化；HTTP200/匿名401/真实UI通过；当前3个Bot、受管绑定0、企业设备未登记、私人上传关闭，未触发业务写入或推理。
- 源码四件套、原始字节hash、可执行ROLLBACK.sh与完整命令结果见evidence/runtime-gate/VERIFICATION.txt。源码降级不是执行器停止证明，数据库不DROP。
