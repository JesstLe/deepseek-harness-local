# M5.2 桌面实例与依赖生命周期

2026-11-17；分支 `fix/naumi-bot-lifecycle-20261116`。完整 M1–M5 目标保持 active。

## 原因与基线

原 backend 只比较 symbol.svg 的 SHA256。干净员工 profile 指向另一个相同 Logo 服务时会返回 owned=false 并连接它；已有 junction 也不随 resources 变更验证。已用独立 HTTP fixture 复现，不读取真实账号，不操作实际3080。基线268项通过。

## 已实现的契约

| 编号 | 实现 | 验证方式 |
| --- | --- | --- |
| INS-01 | 员工 home 生成独立 UUID 和随机实例密钥，JSON版本1、持久化、拒绝损坏/未来版本/元数据链接；密钥不进URL、命令行或渲染层 | 重开/双profile/损坏文件测试 |
| INS-02 | `/naumi/desktop-instance` 使用随机challenge、HMAC绑定实例ID/PID/bundleId；无Origin、固定路由、有界响应，不以Logo判归属 | 正确/错误key、旧proof重放、跨Origin、真实子进程 |
| INS-03 | 持久启动回执区分starting/ready；已知失败清理自己的runId；未知fork或活PID不可达不再启动第二个后端 | null PID/live PID/缺失exe测试；未知不自动重放 |
| INS-04 | 他人占端口则选择新loopback端口；真实bind竞争只在已观察失败且EADDRINUSE时有限重试 | 双profile并行抢同端口、同Logo外部进程仍存活 |
| INS-05 | 相同profile/相同bundle的存活后端须通过证明才接回；不同bundle存活时拒绝切依赖，先关闭旧版 | 真实进程重启、接回、活旧bundle升级拒绝 |
| INS-06 | 新建工作区在员工home/workspace，使用原workspaceRegistry.initializeDefault的空历史事务，不依赖系统Documents/PowerShell、不共享全局默认目录，不把安装resources当可写工作目录；显式开发联接模式保留原cwd/服务 | 独立profile与linked模式测试、原注册事务/已有选择保留测试、桌面实际启动 |
| INS-07 | runtime声明profileVersion=1/identityProtocol=1；启动验证inventory和内置Node哈希 | 损坏inventory/Node、未知contract测试 |
| INS-08 | profile状态记录当前/前一resources版本与挂载；只管理自己的junction，旧版默认指向当前resources的junction可adopt，普通目录/其他junction不接管 | 既有自定义配置、普通依赖目录、legacy边界 |
| INS-09 | journal的prepared/detached/switched/committed检查点；提交前恢复原挂载，提交后完成清理；只重命名/移除junction，不删除资源或员工文件 | 真实独立进程在4阶段exit73，重开恢复 |
| INS-10 | defaults只在不存在时创建；员工SQLite、人物设定/记忆、浏览器字节与UNKNOWN样例保留，不做业务重放 | 真实EmployeeStore/schema1和浏览器文件hash；实际桌面续跑 |
| INS-11 | 归属证明后的停止请求再次HMAC绑定具体PID/bundle，触发原Harness SIGTERM处理器；接回的后端也纳入正常退出；观察到退出才算stop完成 | 错PID/错proof拒绝、停止callback、接回后退出 |
| INS-12 | 打包拒绝实例密钥/回执/profile-journal；beforePack拒绝旧contract和陈旧源码，原生浏览器跟随最终动态host创建 | 实际stale gate、runtime扫描、真实桌面双实例 |
| INS-13 | listener/实例证明就绪与本地owner引导就绪分开，启动/接回都等精确端口的引导URL再导航；不在仅端口可用时把裸URL交给窗口 | 延迟250ms输出引导URL的真实子进程、实际桌面正常重启 |
| INS-14 | standalone worker脱离Windows GUI的libuv子进程job，桌面崩溃不带走工作进程；正常退出仍通过实例证明停止，并观察退出 | 真实独立Node launcher SIGKILL、实际Electron主进程SIGKILL及原PID接回 |
| INS-15 | 退出使用idle/stopping/ready门；重复quit在停机完成前仍preventDefault，不因重入绕过异步清理 | 可控Promise阻塞停机时的连续quit单测、实际桌面正常退出 |
| INS-16 | 停止响应使用底层finish事件调度SIGTERM，不依赖被compression包裹的end回调；200 stopping与真实退出分列 | 丢弃end回调的HTTP中间件测试、真实带压缩Host进程退出 |

## 数据与故障处理

- `desktop-instance.json` 含本地实例密钥，属于员工home私有文件，构建输入不包含home。`desktop-profile.json`、`desktop-profile-journal.json` 与 `desktop-backend.json` 也不进入安装资源。
- 单实例锁按Electron userData隔离。profile链接事务在主进程持有此锁、且没有活的同profile后端时执行；工具函数本身不声称提供跨进程文件锁。
- 子进程启动先记录intent，再写PID，验证后ready。无法证明是否仍有进程的记录保持UNKNOWN/不可达，不靠复制空profile恢复，也不杀外部PID。
- 旧版profile若遇无实例证明的旧版同Logo进程，要求先停止旧版，不猜测它属于哪个home。当前resources的默认legacy junction可无损接纳；不把其他普通依赖目录当安装器垃圾清理。
- 升级事务只切受管依赖引用，业务SQLite schema保持1。本模块不是跨业务schema迁移/已安装程序版本降级验收；后者仍须安装器链完成。
- 明确linked开发模式继续使用原本地服务；新员工默认standalone，始终核对profile归属。
- 真机发现仅修改backend cwd不足以配置默认工作区：原controller仍会发现系统Documents并拼接全局默认目录，且在纯System32 PATH下需要额外PowerShell目录。现复用registry的原始first-use入口注册员工私有目录；仅空registry/空历史生效，不挪动既有工作区，也不重建用户明确删除的默认项。
- 真机还发现listener已通但owner URL尚未输出的启动竞态，温重启可能因此打开未认证页面；新启动先确认实例再等引导回执，回执ready只在两者都完成后落盘。显式linked开发模式保留原行为。
- Windows的非detached Node子进程会随GUI的libuv job终止，不能把“短暂还看得到PID”当崩溃后可接回。standalone spawn现使用独立进程生命周期且隐藏窗口；正常退出仍显式停止，不把worker无条件留在后台。测试故障对象取自Electron主上下文的真实PID，避免误杀Playwright在Windows上的cmd.exe启动壳。
- 原单个quitting布尔量在第二次before-quit时直接允许退出，会绕过第一次仍在等待的flush/stop；进程独立后该问题表现为正常关闭遗留worker。现只有ready阶段允许真正退出，stopping期间的所有重入都阻止默认退出并复用同一次清理。
- 真机明确复现Host的compression中间件可丢弃res.end第二参数回调，导致停止请求虽200但SIGTERM没有发出；现监听底层finish。管理端始终观察PID真正退出，不把stopping回执当停机完成。旧版有缺陷的测试进程仅在新鲜实例证明核对后清理，不计入新版正常退出验收。

## 验证和交付

证据：`evidence/desktop-lifecycle/VERIFICATION.txt`，代码四件套、原字节hash、副本回滚、集中模块结果、build与实际桌面结果按该文件记录。模块测试293项（原268+25）。真实桌面验证用独立userData、纯系统PATH、受控同Logo服务器，不碰用户Chrome、ego资料或真实员工home。

本轮不切换实际3080运行版，不登记设备、不启用私人上传、主动AI规则或真实模型路由。

## 下一模块

远程企业origin配置、Electron企业session请求桥和首次连接；在引入远程企业session前补测endpoint/监听端口与手工克隆home的归属边界，刷新首次bridge连接后的能力观察。之后安装/升级/卸载、数据schema迁移及Windows数据库文件handoff、版本回退矩阵、签名/依赖审查、员工授权及真实业务验收。完整目标不以本模块的unpacked测试替代。

```text
接续 M5：先看 GOAL_TRACKER 与本文结果，核对实际 Git/进程。
复用实例证明、动态host、profile事务、原生浏览器与既有审批/运行门。
远程企业cookie只留Electron session，固定origin/业务API代理，不交给renderer/backend。
保持现有左侧、模型位置和浅色Naumi UI；配置项只放必要操作，不加标语。
分清module、unpacked、NSIS和真实员工验收；每模块更新文档并交付可回滚证据。
```
