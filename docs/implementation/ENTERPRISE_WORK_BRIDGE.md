# 企业任务与交付接入

2026-11-16；GPT-6.1 Sol。工作台：`http://127.0.0.1:3080`；企业协作：`http://127.0.0.1:3112`。

工作 → 企业任务：先在企业页登记并关联数字员工，再由有权账号明确关联原企业任务。数字员工设备使用登记账号的真实业务权限执行，不能替代账号角色、任务 assignee 或资源授权。

本轮支持领取、PNG/JPEG/WebP/PDF 私有文件上传、按原交付项交稿、真实版本/审核/验收状态和持久化业务回执。交稿进入专业审核；专业审核与业务验收继续原系统，Agent/设备没有审批动作。本机目标/文本交付继续独立标记 local-owner。

网络结果不明写 UNKNOWN，不报成功、不换键重放；重启后通过原服务端回执恢复。owner 明确核对后重试才重新发出同键请求。上传成功回执保留 SHA256 和原资产 ID；确认后清除本地冗余文件正文。卸载等待在途写入。

新 Agent 工具 employee_enterprise_work/claim/submit/receipt：绑定真实 caller Bot/Session，写限 Lead；不接收任意 tenant/employeeId；不提供任意本机路径上传或审核工具。企业验收意见只产生待确认 procedure 记忆，保持学习开关与来源。

完整服务端边界/证据：`E:/Workspace/naumi-design-ops-digital-employees/docs/implementation/DIGITAL_WORK_BRIDGE.md`。

测试：178 Harness、214 企业端、13 浏览器交互、真实 Next.js 原命令/私有下载/独立验收、实际 Harness 只读检查均通过。四件套在 `E:/Workspace/naumi-design-ops-digital-employees/evidence/enterprise-work`。原件/hash/复制回滚保留，本地实际运行版仍为新版；真实设备登记与自动上传没有开启。

下一实施提示：

```text
继续总目标，不关闭为一个模块。先读 GOAL_TRACKER、NAUMI_DIGITAL_EMPLOYEE_PRD、DIGITAL_WORK_BRIDGE。Harness=E:/Workspace/naumi-bot-lifecycle-fix；控制面=E:/Workspace/naumi-design-ops-digital-employees；实际企业端=naumi-design-ops:3112。M3 已接入组织/设备/离线授权/记忆同步/整理和原生企业交付。现在推进 M4：确定性能力清单、经 owner 批准的主动规则、服务端预算与独立模型通道、执行 placement/attempt/fencing/租约和 UNKNOWN 回执，再 M5 带 Logo/预装插件/浏览器/首次登记/升级迁移回滚的员工安装包。勿把数据库幂等当成任意桌面副作用的防双执行。保留原模型位置、角色与审批分离、本地优先和所有未提交工作。模块后集中测试/文档/选择性 Git 推送。
```
