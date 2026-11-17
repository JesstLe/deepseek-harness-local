# 企业连接、私密同步与离线授权

2026-11-16；GPT-6.1 Sol。

企业服务实际仓库：`naumi-design-ops`，URL `http://127.0.0.1:3112`。服务端模块与完整边界记录：`E:/Workspace/naumi-design-ops-digital-employees/docs/implementation/DIGITAL_EMPLOYEES_M3.md`。

本轮新增：employee-sync.js、employee-sync-http.js、employee-device-vault.js、employee-sync-panel.js；host → bots → employees 传递固定 collaborationOrigin。来源只从安装配置读取，禁止页面自报任意远端。远端需 HTTPS，开发回环可用 HTTP。

## 数据

- 原 employees.sqlite/M1 和任务/Session 不迁移；独立 employee-sync.sqlite 保存设备配置、公钥 pin、授权、远端 revision、加密 outbox/冲突/共享缓存。
- `.device` 是 Windows DPAPI 密文，不是明文 PEM；数据缓存用随机 AES-GCM 密钥，密钥本身在 DPAPI 中。
- 首次登记需要企业会话，只转发 design_ops_session；不读取密码，不转发 Harness cookie、API Key。后续同步凭设备签名，业务会话不是逐条消息依赖。
- 私人同步必须人工确认并开启；不默认上传当前三个 Bot；目标/交付/验收仍 local-owner。
- 同步记录是真实私人档案/记忆当前快照，保留原来源，不把所有历史原始聊天上传。

## 可操作入口

员工中心 → 企业：登记设备 → 新建/选择有管理权的企业员工 → 关联当前 Bot → 明确确认私人档案/记忆上传 → 开启同步。

冲突保留两份正文，手动选择采用企业版或保留本机再提交。锁定字段与记忆删除终态继续生效。共享记忆必须选择已确认记忆发起审批；申请人不可自审；Agent 没有审批工具。

## 已验证

- 企业服务 206 项完整回归；Harness 166 项回归；真实双 SQLite/PG/DPAPI 故障链通过。
- 浏览器 5 项交互，宽/窄截图已检查；实际运行版企业页只读检查通过；安装目录仅同步 10 个文件，其他文件 hash 不变。
- 实际服务设备尚未登记，上传关闭。没有使用真实员工资料制造测试业务。
- 四件套：`E:/Workspace/naumi-design-ops-digital-employees/evidence/digital-employees/{MODIFIED_FILE.zip,DIFF_FILE.patch,VERIFICATION.txt,ROLLBACK.sh}`。原件与 hash 在同目录，副本回滚不删数据库/Session/凭证。

## 接续，不丢项

MEM-007 批量预览/精确重复合并/遗忘，企业工作/资产/审批的明确衔接，M4 企业执行门/预算/能力/独立模型通道与租约，M5 安装升级包仍需完成。不能因企业页出现“已同步”就说整个员工生命周期或分布式执行完成。

复用实施提示：

```text
使用 GPT-6.1 Sol 继续 Naumi 数字员工总目标。先读 GOAL_TRACKER、NAUMI_DIGITAL_EMPLOYEE_PRD、EMPLOYEE_SYNC_M3 与服务端 DIGITAL_EMPLOYEES_M3。Harness=E:/Workspace/naumi-bot-lifecycle-fix；实际企业端=E:/Workspace/naumi-design-ops，隔离开发=E:/Workspace/naumi-design-ops-digital-employees。不改旧 naumi-co。先完整推进 MEM-007 和企业工作权威，再 M4/M5。保留本地优先、当前模型位置、轻色 UI、tenant/RBAC/revision/幂等/不可变审批。共享审批不下放给 Agent；断心跳不重派未知副作用。完成模块再集中测试，文档与证据同步，选择性 Git 提交推送。当前目标 active，不把局部 pass 当全部完成。
```
