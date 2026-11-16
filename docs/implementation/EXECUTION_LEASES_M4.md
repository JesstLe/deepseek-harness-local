# 执行归属与租约接入

2026-11-16，GPT-6.1 Sol。当前 M4 已接入企业写入的执行归属；M4 其余项与 M5 继续。

新增 employee-execution-leases.js：网络前持久化 attempt，沿用设备加密 vault 保存 grant；每次企业写入前取得当前许可，携带 attemptId/fencingToken。断网、ACK 丢失、重启不自动换 attempt，明确释放后的 idle 新代次才启动新 attempt。

本机绑定/云端绑定固定具体设备；独占执行允许经明确停止核对后的迁移。ownerDevice 与资源 boundDevice 分开。租约过期不认为执行器已停止，也不自动接管。UNKNOWN 外部结果冻结提交，旧 fence 不再提交。原业务回执可查询，不因租约到期失去已确认结果。

员工中心 → 工作 → 企业任务：执行状态、恢复租约、owner 执行配置/绑定设备/停止核对；企业 → 登记设备：owner 配置执行类型。模型不获取改类型、改位置、停止释放工具，也不自行填 fence。

详细实现/边界：`E:/Workspace/naumi-design-ops-digital-employees/docs/implementation/EXECUTION_OWNERSHIP_M4.md`。223 企业端、183 Harness、18 UI 和实际 Next.js 双设备故障链通过；源码包与副本回滚位于 `E:/Workspace/naumi-design-ops-digital-employees/evidence/execution-leases`。8 控制面/7 插件文件增量接入，当前真实设备仍未登记。

本模块不声称任意第三方 API、shell 或浏览器已支持 fencing；全局执行门及主动规则/能力/预算/独立模型通道仍需后续接入。

```text
使用 GPT-6.1 Sol 继续 Naumi 数字员工完整目标。先读 GOAL_TRACKER、NAUMI_DIGITAL_EMPLOYEE_PRD、EXECUTION_LEASES_M4 与服务端 EXECUTION_OWNERSHIP_M4。Harness=E:/Workspace/naumi-bot-lifecycle-fix；控制面开发=E:/Workspace/naumi-design-ops-digital-employees；实际运行=deepseek-harness-local:3080、naumi-design-ops:3112。已有 M1/M2/M3、企业工作桥、租约与设备资源绑定；下一 CAP-001/HBT-003/004/BUD-001/LOC-004 和运行执行门，再 M5 完整安装/升级/回滚。不要拿心跳当进展或停止证明，不因丢心跳重派 UNKNOWN 外部副作用；保留原模型选择和角色审批分离。模块后集中验证、文档、四件套和选择性 Git 推送；总目标 active。
```
