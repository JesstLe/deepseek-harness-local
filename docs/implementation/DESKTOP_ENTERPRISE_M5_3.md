# M5.3 企业首次连接与桌面登录桥

日期：2026-11-17。完整目标 active。本模块不替换实际3080服务，不使用真实员工或供应商凭证。

## 模块目标

员工桌面从开发机地址中解耦：首次填写企业地址、在企业窗口正常登录、本地工作台读取该账号被授权的任务/员工目录，以及经明确操作登记设备。Cookie始终由Electron企业session持有；本地后端使用有限业务请求桥。原设备签名、组织RBAC、离线授权、运行门和私人上传确认继续权威。

## 接口与归属设计

### 实例协议2

- `/naumi/desktop-instance` 保留路径，响应version升级2。
- HMAC输入为 `2|nonce|id|pid|bundleId|homeHash|port|enterpriseOrigin`；停止输入在2之后增加`stop`。
- `port`来自实际`req.socket.localPort`，不读取Host或X-Forwarded-Port；client与连接的准确URL端口比对，不能通过relay证明另一端口归属。
- `homeHash`来自规范化realpath（Windows大小写归一）。`desktop-instance.json`保留version1/UUID/key，原地增加homeHash；不改员工SQLite或device key。
- 已绑定home被复制或移动：报 `PROFILE_HOME_RELOCATION_REQUIRES_MIGRATION`，不自动轮换身份、删除回执、杀旧worker或启动第二个实例。
- 遗留无homeHash文件：只补充当前目录绑定。即使手工克隆旧文件，协议2会核对worker实际home，不因UUID/key相同误附着。
- 活的协议1worker不作降级兼容、不自动停止。员工须先正常退出旧程序再升级；存活但不被协议2证明的回执仍阻止重复启动。
- runtime manifest仍schema2/profileVersion1，identityProtocol=2。旧runtime不被新客户端猜测接受。副本回滚恢复协议1，不代表已安装程序或数据库降级已验收。

### 首次连接

- 浅色独立`connect.html`，仅Logo、企业地址、连接操作和必要错误。
- 默认standalone无固定本机企业地址；首次保存 `home/desktop-enterprise.json` `{version:1,origin}`。未配置时不启动后端。
- HTTPS允许；HTTP仅loopback用于本地部署/测试。拒绝user/password、path、query、fragment。
- `NAUMI_ENTERPRISE_ORIGIN`可作为受管部署输入，仍经过同一验证并落入本profile配置。
- 同profile同origin幂等；变更issuer报 `ENTERPRISE_PROFILE_SWITCH_REQUIRED`。企业切换/搬迁需要独立profile或后续显式迁移流程，不复用旧设备授权、共享缓存或私人队列。
- 仅connect.html主frame可提交配置IPC；工作台只能申请打开固定企业登录，不提供任意IPC或Cookie查询。

### 企业session请求桥

- 每个Electron userData、每个企业origin独立持久partition。与本地工作台primarySession、原生浏览器partition分开。
- 登录窗口使用该企业session，没有preload/Node，限制主文档导航和redirect到企业origin，正常关闭登录窗口后刷新工作台；应用退出时先停止/销毁登录窗口并禁止reload/boot重新导航，避免关机过程中重新加载已停止的后端。真实E2E包括带登录窗口退出和观察GUI实际PID结束。
- Electron `session.fetch` 使用自身登录Cookie。没有读取/序列化Cookie、没有把Set-Cookie交给本地renderer/backend。
- 原私有Bearer loopback bridge新增 `/enterprise/request`，仍拒绝Origin请求。旧 `/health` 字段与浏览器 `/op` contract不变。
- 请求只接受origin、endpoint、method、body。固定允许：GET `/api/workspace`，GET/POST `/api/digital-employees`。不允许query、URL、编码绕过、任意headers或`/device`。
- POST是带operationId UUID的JSON object，最多1MiB；bridge JSON包体最多2MiB+4096；响应JSON最多8MiB；超时15秒；最多4个在途请求，超额直接拒绝。
- 禁止redirect；只返回JSON正文和HTTP status，没有上游headers。401/403保持登录/权限语义，应用层不自动重试mutation；Chromium网络层可能重传，因此POST必须带调用方原始operationId UUID，复用企业端digital_request_receipts事务去重。超时/断网仍保持未知结果，用同一operationId核对，不创建新ID重做。
- `EmployeeSync`只把catalog/manager/enroll/bind登录会话请求交给bridge。原`/device`签名通信直接到企业服务；不代理设备签名或改RBAC。
- standalone始终使用所属企业session，不拿localhost里碰巧出现的业务cookie回退。普通web/显式linked开发模式仍走原业务Cookie适配器。
- 首次bridge创建/GUI重启时，能力清单在读取时检测descriptor PID/port变化并触发刷新，不等待一分钟轮询。

### 干净员工环境发现

首次真实fixture登记使用原DPAPI vault。原代码依赖PATH发现powershell.exe，在纯系统PATH下失败；现从SystemRoot下WindowsPowerShell的固定绝对路径启动。不增加开发环境依赖，也不落明文device私钥。

原桌面双profile实测还复现Windows短暂文件共享占用：回执的renameSync报EPERM。现在仅对Windows EPERM/EBUSY/EACCES做最多7次有界退避，保留已fsync候选和原权威回执，不先删除目标文件。真实独立PowerShell进程持有FileShare.Read锁后释放的回归覆盖该handoff。

## 验收矩阵

| 项目 | 证据 | 退出边界 |
| --- | --- | --- |
| 原293项回归 | BASELINE_TESTS.log | 基线 |
| relay/克隆home | BASELINE_REPRO.log、MODIFIED_REPRO.log | 原缺陷复现与修复 |
| 固定接口、body/response/admission、cookie不导出、401/403、不重试 | MODIFIED_TESTS.log | 模块 |
| 显式首次连接、企业登录、workspace/catalog、登记proof/DPAPI、权限/过期/重启、双员工隔离 | DESKTOP_ENTERPRISE.json、DESKTOP_ENTERPRISE.log | 独立unpacked Electron + controlled fixture |
| 原生浏览器/父进程强杀接回/私有数据保留 | DESKTOP_LIFECYCLE.log | 原桌面E2E继续通过 |
| 正式npm包、ASAR/resource hash、完整inventory/打包Node/无祖先回落 | PACKAGE_CONTRACT.json | 候选产物 |
| 原字节恢复、原293项、协议1行为/数据保留 | ROLLBACK_RESULT.json、VERIFICATION.txt | 副本回滚，实际新版保留 |

## 本轮不冒充完成的门槛

- 远程真实HTTPS企业与本人账号首次授权、真实设备绑定/模型策略和真实供应商使用。
- 真实NSIS安装/升级/卸载、已安装版本迁移/回退、业务schema迁移与Windows数据库文件handoff。
- 首次地址填错/服务器不可达时的连接修复UI，以及显式企业切换/员工目录搬迁的产品化迁移向导。当前已持久化origin不在原profile内静默改换；安装发布前补齐可回到连接设置的失败恢复路径，且保留设备/授权/缓存隔离约束。
- 签名证书、依赖问题审查与干净员工机实际业务验收。

## 可复用接续提示

```text
接续 Naumi M5：先核对GOAL_TRACKER、本文和desktop-enterprise/VERIFICATION。
保留浅色Naumi UI、左侧导航、原模型选择、原生浏览器、企业session与设备签名分工。
新员工不继承开发者凭证；不自动登记、上传、启用AI；不以fixture或unpacked代替实际安装/远程员工验收。
下一模块推进NSIS真实安装与已安装版本/业务数据升级回退，保护现有安装和员工userData；完整模块后集中测试、记录并选择性提交。
```
