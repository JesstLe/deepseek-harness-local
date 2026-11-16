# M4：能力、工作观察与本地主动规则

2026-11-16。实施：GPT-6.1 Sol。基线：`6b8b9a2`。本模块继续完整数字员工目标，不关闭 M4/M5。

## 实现

| 模块 | 作用 |
| --- | --- |
| `employee-activity-store.js` | owner 规则配置/CAS/审批、确定性时间/目标到期选择、原子通知/入队与收据 |
| `employee-observation.js` | 原生运行状态、Agent 自报等待/受阻、带事件来源的实际进展 |
| `employee-capabilities.js` | 安装、连接、授权、健康、采样时间分别测量；未知/过期不伪装通过 |
| `employee-activity.js` | 一个30秒定时器、owner HTTP、两个 Agent 工具、卸载清理 |
| `assets/employee-activity-panel.js` | 员工中心“运行”：能力矩阵、运行观察、主动规则、通知、执行收据 |

原左侧、模型选择、企业登录、原生浏览器显示方式均保持。`/naumi/employee-activity` 复用 Harness owner admission；POST 检查自定义 header、同源和16KiB上限。不向 Agent 暴露启用、编辑或提权工具。

## 数据与状态

数据仍先落 `${DSH_HOME}/naumi/employees.sqlite`。`proactive_rule/proactive_run/notification/activity_observation` 使用原 entities/events/operations，新增 `employee_activity_clock` 高水位表，不修改 user_version=1、不迁移已有档案/记忆。私人同步仍显式只收集档案与记忆；规则和报告不会悄悄上传。

规则包含 Bot/local-owner 作用域、title、trigger、action、workWindow、cooldownSeconds、maxActions、configVersion、revision、approvedAt、nextAt、累计行动数。创建默认停用；配置修改撤销审批；owner 另行启用。支持：

- 至少60秒的固定间隔，复用原生 Schedule `resolveEveryOccurrence` 的 latest-only 算法；休眠/重启不回放整段历史。
- UTC 明确时刻的一次性触发。
- 本员工全部或指定目标到期；排除暂停/取消/完成目标，以目标ID+dueAt去重。
- IANA 时区工作窗口、ISO工作日；目前使用显式同日 start < end 窗口，不隐式跨午夜。静默时间只延迟本地通知/入队，没有紧急越权分支。
- 每规则至少60秒冷却、累计1~1000次行动上限；最多100条规则与10000条收据/员工，达到容量明确报错，不覆盖审计。

只有两种行动：本地通知、创建带验收条件的 `planned` 目标。效果、下一时刻、计数和唯一收据同事务提交；崩溃前未提交全部回滚，提交后重启查原收据。停用后再启用同一配置不会重新通知同一到期事件。更新配置形成新 configVersion，属于新的 owner 授权。时钟回拨超过1秒冻结主动规则，资料继续可读，时间追上已持久化高水位后恢复。

这不是自动 AI 工作执行器：0次模型调用、0个外部动作、不创建 Session、不领取企业任务、不重试UNKNOWN、不更改工具权限。模型自主执行要等权威预算/运行门/模型通道接入，仍在总目标内。

## 观察与能力的证据含义

- 原生 `agent/status` 是活动，不是进展；`agent/error` 只持久化固定错误码，不保存可能含凭证的原始 error 文本。
- `employee_activity_report` 只接受本员工真实 root Lead，保存 `agent_report` 来源。working / waiting_user / waiting_dependency / model_unavailable / blocked 独立；模型自述不会刷新实际进展时间。
- 真进展引用已保存 artifact/review 的 eventSeq/entityId/time；会话进展只算该会话产生的 artifact，其他会话产物不会掩盖当前会话长期无进展。
- 默认30分钟无实际产物变化仅标记“待核验进展”，不取消、不重派。等待与故障不合并为卡死。执行器不在 live registry 时显示 unknown，不根据失联声称已停止。
- `employee_capabilities` 只读上次采样。installed/connected/authorized/healthy 可为 null，超过3分钟标 stale；工具已注册不等于有 OS/企业账号权限。
- agent-desktop 包版本与本机二进制hash核验代表已内置，MCP工具注册单列；本模块未调用桌面输入/截图，连接与操作许可未核验时保持未知。
- 原生浏览器新增认证 `GET /health`，只有协议版本/PID/引擎，不读取页面、不截图、不经过操作队列。陈旧descriptor不再让新能力矩阵误报连接；旧桌面返回404时报告需要健康探针升级，不重启或抢占用户窗口。
- 钉钉显示的是 Naumi 分发包清单，不扫描/否定全机其他目录。当前包尚未登记钉钉CLI，M5仍要补齐真正的内置依赖、版本、许可、登录与安装验收。
- 企业授权只证明有效签名设备包里的当前Bot绑定；每个线上业务操作仍需原服务端RBAC/任务/项目/租约核验。能力采样不自动联网刷新授权或上传。

## 验证与交付

证据目录：`evidence/proactive-runtime/`。完整回归、隔离真实Cordis/SQLite/HTTP、真实壳候选UI、硬杀进程恢复、副本回滚与实际3080只读检查分开记录。当前真实设备登记和自动上传不因本模块改变；测试规则只存在隔离数据。

四件套为 `MODIFIED_FILE.zip / DIFF_FILE.patch / VERIFICATION.txt / ROLLBACK.sh`。回滚仅对显式标记的独立副本执行、逐文件核验当前/原始hash；源码回滚保留SQLite资料，不表示原执行器已停止。桌面health代码进入下一安装包；现有桌面窗口不强行重启。

## 下一模块

1. 全局 managed-session 运行门：原工具guard与步骤准入，不破坏普通本地会话权限。
2. 服务端权威预算/并发与独立模型通道，明确不可达等待、预授权路由、不静默切贵模型。
3. 接通受控AI主动执行，再验证控制中心故障/模型可达等完整链路。
4. M5带Logo、原生浏览器、桌面能力、钉钉CLI的无密钥安装包；新员工环境、升级迁移与回滚。

### 可复用续跑提示

```text
使用 GPT-6.1 Sol 继续 GOAL_TRACKER 的完整数字员工目标。先读 EMPLOYEE_ACTIVITY_M4、EXECUTION_LEASES_M4、BOT_LOCAL_FIRST 和完整 PRD。现有主动规则仅执行本地确定性通知/入队，Agent报告不是进展、工具注册不是授权、失联不是停止。下一实现 managed-session 运行门、权威预算与独立模型通道，再接主动AI执行和M5。保护实际3080/3112的其他功能，只增量部署；每个模块集中验证、同步文档、四件套、选择性Git提交推送。总目标仍active。
```

## 本模块已核验结果

- 全仓197/197，通过、无skip；其中新增14项能力/规则/观察/HTTP/真实timer测试。
- 候选UI：12项操作通过、0 page errors；桌面/680px窄屏实图已打开复核，原左侧和模型位置保持。
- 真实进程：事务打开后SIGKILL，重开时0个未提交效果；确认提交后SIGKILL，重开时1条通知/收据、0重复动作。
- 回滚：独立副本恢复6旧文件、移除5新文件；旧员工6项测试通过；旧EmployeeStore仍读到新版写入的档案/记忆/规则历史，schema=1。
- 实际3080：10插件文件hash核验、其他插件文件0改动；HTTP200、匿名401、界面通过；真实规则0、业务mutation0、设备未登记、私人上传关闭。desktop/app/tools.cjs仅进入源码与下一安装包，未强制重启既有桌面。
- Git、四件套及实际源码/运行版hash重开核验见 VERIFICATION.txt。本模块未执行生产服务器发布或新员工安装验收。
