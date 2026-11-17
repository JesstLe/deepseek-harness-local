# M5.4 连接恢复、企业工作区与真实 NSIS 安装链

日期：2026-11-17。完整目标 active。基线提交：1cea9056dddfa091a1a6cb8f5c767db8b05adbe0。

## 设计决策

企业地址修复不等于覆盖issuer。原已保存origin、签名设备、私人同步队列、员工记忆和浏览器状态都可能属于旧企业；直接重写配置会把这些数据带给另一服务器。因此采用独立企业工作区，并保留旧工作区以便返回。现有单企业配置仍在原userData/harness，身份和数据原字节保留。

## 实现

- 新`desktop-workspaces.json` version1：active和有限的id/origin列表，不存Cookie、凭证、私钥或任意绝对路径。
- 默认id为default，沿用原harness。新增工作区UUID目录位于userData/enterprise-workspaces/id/harness，独立identity、SQLite、设备vault、同步和默认文件工作区。
- 新目录和配置先准备，再原子提交active指针；失败保留原active，准备目录不自动删除。损坏/未来版本/路径注入/目录junction不被静默覆盖。
- `connect`配置本身仍不可换issuer。返回已有地址只选原工作区，不复制旧home、不轮换原UUID/key、不重新登记设备。
- 首次连接先以credentials=omit、禁止redirect的固定GET /api/workspace检查JSON接口。接受Naumi的401 UNAUTHENTICATED、受控权限待分配或合法workspace结构；这是接口兼容性检查，不代替TLS/账号/组织权限验证。超时8秒，响应最多64KiB，可取消。
- 网络/接口错误、取消均不持久化新origin或active指针。
- 连接页可从启动错误页或系统连接进入；已有工作区可返回本地工作台。启动已有工作区不等待企业在线，服务器故障不把本地历史页面锁在连接引导中。
- 切换前检查原owner session/list。运行中、状态未知或桥操作未结束时不停止原worker。打开连接页本身也先检查，避免销毁正在使用的原生browser guest。
- 原worker正常HMAC停止且观察退出后，再关闭旧bridge并选择新home；不按同名进程批量结束。
- 原生browser namespace随工作区变化。Guests复用原attach监听器，reset先flush/release再更新account与hostURL；不重复注册监听器，动态端口重选时同步host。
- 企业session继续按origin隔离；返回旧工作区沿用旧partition。登录popup在打开连接设置时关闭但不触发竞争reload。
- Web页面不出现桌面专属操作；仅桌面系统连接增加一个功能按钮。旧frontend逐字节等价测试只排除这一个明确新增动作，其他原UI/模型/权限行为保持约束。

## 版本和安装设计

- 桌面候选0.2.1，正式appId/com.naumi.desktop、Naumi Logo和产品名不换成测试身份。
- 0.2.0基线NSIS从已经验证的原unpacked产物构建；候选从当前源码构建。固定官方钉钉CLI、内置Node、原生Chromium和完整运行依赖继续入包。
- `useZip=true/differentialPackage=false`：使用NSIS支持的ZIP直接解压，避免7z临时解压后再走CopyFiles逐文件复制。当前客户端未接自动差分更新，保留完整安装包升级路径。
- 运行副本排除24,933份开发类型声明/外置源码映射，70,363降至45,430文件；源仓库和原始安装包不动。所有保留文件逐一验证旧SHA256不变，JS/native/schema/skills/license/font.map不作泛化裁剪。正式包和真实安装仍需完整导入/资源/桌面验证。
- per-user、allowElevation=false；默认卸载不删除appData。实际测试前，精确检查产品GUID在HKCU/HKLM的32/64视图、AppUserModelId、标准快捷方式、默认安装目录和固定产品pin。存在旧注册安装/pin时不覆盖测试。
- 已有自定义Naumi快捷方式以SHA256保护；真实APPDATA/Naumi只记录文件名/长度/写入时间，不读取浏览器Cookie或Local State内容。安装应用本身通过独立测试userData启动。
- 实际NSIS安装目标只允许本工作树.dsh中明确拥有的测试目录；每次升级/卸载前核对注册表InstallLocation，防止结束或卸载别的安装。
- 旧0.2.0应用的ZIP控制安装包 -> 正常停止GUI/worker -> 0.2.1 ZIP升级 -> 正常停止 -> 旧0.2.0应用ZIP降级 -> 卸载，分别观察版本、Logo、实际打包Node根路径和数据。
- 原始7z NSIS在该机逐文件复制超过20分钟；5分钟观察器退出后原进程继续，最终进程已结束但.NET观察器退出码为null，按UNKNOWN保留，不记为通过。注册/标准快捷方式已清理，旧自定义快捷方式与真实用户数据metadata恢复一致。旧应用由原NSIS内嵌7z提取，校验7z头/内容CRC、原exe SHA不变，再仅去除开发文件后ZIP重包；程序JS/原生执行文件不改，不把该ZIP控制包混称为原7z安装器。
- 单企业旧profile的人设/记忆/schema1、明确UNKNOWN样例、DPAPI设备vault、真实fixture登录Cookie和设备登记必须只初始化一次并跨版本保留。

## 证据和验收矩阵

| 门槛 | 证据 | 边界 |
| --- | --- | --- |
| 原315项基线 | BASELINE_TESTS.log | 原源码 |
| 连接恢复/隔离/活动准入/路径保护 | MODIFIED_TESTS.log | 333项模块回归 |
| 错地址/不可达/取消不落盘，A/B/A、cookie隔离、人格记忆、离线重启 | WORKSPACE_RECOVERY.json | 实际unpacked Electron + 受控企业 |
| 真实安装/升级/降级/卸载 | NSIS_INSTALLATION.json | 正常停机、旧单企业profile；不是故障中升级 |
| 包内源码与资源 | PACKAGE_CONTRACT.json | ASAR、正式npm包、逐文件hash和内置Node |
| 源码副本回滚 | ROLLBACK_RESULT.json、VERIFICATION.txt | 原315项与原行为，实际新版保留 |

四件套、完整原字节hash和各命令输入/输出/退出状态按evidence/desktop-installation/VERIFICATION.txt记录。以实际生成的结果文件为验收依据，未生成/未PASS的行不算完成。

## 卸载观察器修正与独立复核

真实 ZIP 安装链已经发出0.2.0安装、0.2.1升级、0.2.0降级的成功回执，逐一检查45,430份资源hash、Logo、真实installed执行路径、原identity、人设/记忆/schema1、DPAPI设备vault、企业登录与UNKNOWN样例。登录和登记各一次的断言在首次卸载前完成。

原命令最终退出1：NSIS自复制卸载子进程尚在清理时，launcher已退出0；原30秒观察窗口超时，finally又发出一次卸载。`NSIS_INSTALLATION_ATTEMPT2.log`和`NSIS_ATTEMPT2_INPUT.mjs`保留原失败及输入，不将它改写为exit0。独立只读命令`node scripts/reconcile-desktop-installation.mjs .dsh/ni-2c0b82a4`随后exit0，验证安装目录/产品注册项/标准快捷方式消失、相关进程停止、原自定义快捷方式与真实APPDATA元数据不变，测试员工SQLite及vault仍在。报告明确`reconciledAfterObserverTimeout=true`；会话/计数/跨版本vault一致性采用已保存阶段断言，不在卸载后读取Cookie重造历史证据。

新的`nsis-observer.mjs`在完整目录与环境恢复后才结束；等待300秒，超时只记录不重复启动，阶段与native退出码写持久checkpoint。4项回归覆盖延迟删除、超时继续观察不重复、launcher失败不重复、checkpoint覆盖写。修订后的整条真实安装链没有重跑，不能把单元测试称为修订runner真机验收。首次只读复核曾匹配自身PowerShell进程，失败日志保留；排除自身PID后复核通过。

## 仍需完整推进的门槛

1. 安装器对硬杀后独立worker、运行中任务和Windows句柄的认证quiesce/停止、失败回滚；本模块只验收正常停机安装链。
2. 已选择新企业工作区时回退到不认识index的旧版本，需要明确的兼容/阻止/恢复策略；本模块降级矩阵只覆盖原单企业home，不宣称跨工作区旧版降级通过。
3. 新业务schema的真实迁移/失败恢复/降级矩阵；当前员工SQLite仍schema1，无虚构schema升级。
4. 真正干净员工机、远程HTTPS企业地址与员工本人授权、模型/供应商/定价预算、真实业务交付验收。
5. 发布签名、依赖审查和最终发布分发。当前NSIS候选不等于正式发布完成。

## 可复用接续提示

```text
接续Naumi完整目标：先核对GOAL_TRACKER和本文实际证据，保留现有未跟踪日志。
员工数据按企业工作区保留，不覆盖issuer，不复制Cookie，不静默重放未知操作。
下一补安装器认证quiesce、孤儿worker/运行中操作与跨工作区旧版回退策略，再业务schema和真实员工验收。
不要把正常停机NSIS链、unpacked fixture、Git push当整目标完成。
```
