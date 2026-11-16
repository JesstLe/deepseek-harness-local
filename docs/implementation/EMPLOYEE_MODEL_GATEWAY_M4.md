# M4 企业模型通道与权威预算

状态：模块实现与隔离验证完成，实际部署证据在 `evidence/model-gateway` 更新；总体目标 active。实施模型 GPT-6.1 Sol。

## 产品与运行边界

- 控制中心保留组织、成员、设备、员工、任务 ACL 和模型策略权威；不承担每次模型请求的数据中转。
- 模型网关是独立 Node 进程，持有上游服务端 Key 与独立 SQLite 预算账本；客户端只拿签名短期凭证和网关 URL。控制中心私钥不进入网关。
- 本地保存加密的设备模型凭证、请求 UUID 和流状态；不保存企业上游 Key。安装包不包含现有个人凭证、设备私钥或企业账号登录态。
- 控制中心故障但凭证有效、网关和模型可达时，本地受管 AI 可继续。凭证过期、预算耗尽、网关故障或上游故障分别保留真实状态。同机独立进程不是跨主机高可用。

## 实现映射

| 部件 | 实现 |
| --- | --- |
| 策略与签名凭证契约 | control `digital-model-contract.ts`、`digital-models.ts`、迁移018 |
| 网关契约 / 账本 / HTTP / 独立入口 | `services/model-gateway/{contract,ledger,server,main}.mjs` |
| 加密缓存与公开 PiAiAdapter 接入 | `plugins/naumi-enterprise/employee-models.js` |
| 受管会话禁止 BYO 绕预算 | `employee-runtime-gate.js` 绑定真实步骤选中的 provider |
| 员工中心模型界面 | `assets/employee-model-panel.js`，原模型选择位置不变 |

### 授权

控制中心通过原 Ed25519 设备协议签发 `kid.payload.signature`，绑定 aud/issuer/gateway/tenant/member/device/employee/Bot/task/authEpoch/月度period/策略revision/有效期。任务凭证同时校验原任务 ACL 与有效员工工作链接。模型 token 不存入服务器设备 nonce 回执。

负责人策略使用 CAS、幂等 operationId、租户级事务锁和审计；可获取5分钟、限定租户与动作的 `apply-policy` 或 `charge-ceiling` proof。策略保存与网关应用是两个可观察步骤；应用失败可用“同步网关策略”重新签发，不假装跨数据库原子提交。

### 预算与计费

每次派发前 SQLite `BEGIN IMMEDIATE` 同时预留企业、员工、Bot、任务费用 microUSD、Token 和并发。Bot 使用员工同一组上限，同时受聚合员工额度约束。请求次数按实际派发 attempt 计数。费用用 BigInt 向上取整，UI 使用精确十进制转换，不用浮点金额作为权威。

预留上界使用管理员配置的模型完整 context 上界与请求最大输出；真实 usage 结算后释放余量。模型 context 与定价须匹配供应商合同；网关不是供应商真实财务账单。缺失 usage、断流、含糊500、进程强杀与持久化失败保持 UNKNOWN 和预留；没有定时退款。负责人明确核对原请求已停止后，按预留上界记 `charged_ceiling`，不伪造实际 usage。

UUID 不重放正文；相同请求重复返回409和可查询回执语义。只允许预授权、不更贵且容量兼容的备用路由，在401/404/429或明确未连接时有限尝试。500、断流和未知结果不盲重试。SDK 与外层模型重试均为0。网关不存 prompt、模型正文或上游 Key。

### 生命周期

网关有单进程 PID lock、SQLite application_id/schema门、完整性检测、WAL/FULL、时钟高水位、策略revision和设备epoch单调校验。较新策略即使预算拒绝也持久生效；旧策略不复活。关闭先取消在途请求、等待HTTP处理完成再关账本。硬杀后启动将未完成预留保留为 UNKNOWN，不重发供应商请求。

本地 `stream_complete` 只证明流完成，不冒充网关财务结算。界面主动查询 `/budget` 和 `/receipt`；控制中心暂不可达不会阻断本地缓存状态及预算读取。签名新凭证通过后，旧凭证先被替换，即使catalog失败也不回退旧revision。

## 验证与交付

- Harness/桌面完整回归：230/230；网关模块18项，包含真实AgentLoop、pi-ai原转换器、并发额度、epoch/时钟、跨Bot回执隔离、存储失败和精确金额。
- 企业端：233/233，真实隔离PostgreSQL；9项模型权威子检查及父测试，含初次并发CAS、签名、任务ACL、RLS、撤销和nonce不落token；TypeScript通过。
- 界面：10项，真实3080壳 + 候选UI + 隔离AgentLoop/签名HTTP/SQLite网关；策略界面边缘为fixture，策略服务端已另经真实PG检查。无真实企业业务mutation。
- 独立子进程SIGKILL后UNKNOWN/预留保留/重放0/PID旧锁恢复通过。
- 四件套、逐字节原hash、副本回滚和实际接入证据见 `evidence/model-gateway/VERIFICATION.txt`。

## 尚未退出的完整目标

真实企业供应商路由、合同定价、负责人预算启用、真实员工登记与模型调用需要单独验收；0路由网关的health就绪不算企业模型已可用。撤销在控制中心发生后，未通知网关的旧签名凭证最多可用到其有限有效期，紧急停用需同步较新禁用策略到网关。

M4受控主动AI编排与M5全新员工安装、登录、Logo、预装CLI/浏览器、升级、迁移、回滚继续，总目标不关闭。

## 可复用接续指令

```text
继续Naumi数字员工总目标。先读GOAL_TRACKER、EMPLOYEE_MODEL_GATEWAY_M4及evidence/model-gateway/VERIFICATION。
保持本地先保存、组织权限服务端权威、独立模型网关；不把stream_complete当结算，不自动重放UNKNOWN。
普通会话模型与左侧导航保持；保护运行树和其他未提交文件。按模块开发、集中测试、文档/副本回滚/增量部署/选择性提交推送。
接着完成受控主动AI编排，再做M5安装包；真实路由、真实调用、安装验收与本机fixture明确分开。
```

### 本机接入与回滚完成证据

- 实际3080增量7插件，实际3112增量5文件与迁移018，独立3183增量5网关/启动文件；17个目标hash全部核验，其他插件hash不变。
- 实际Next HTTP签发、网关签名策略、预算读取与禁用旧凭证通过，明确test租户清理；未登记现有真实员工设备，私人上传关闭，无真实供应商请求。
- 副本回滚恢复7旧文件、移除10新文件，35项原Harness员工/主动/准入和223项原企业回归通过，实际数据未动、新版保留。四件套及逐条命令结果已保存。
- 当前网关0路由；真实企业供应商通道启用与M4主动AI/M5仍为后续验收项。
