# Naumi Agent 团队详情面板

## 目标与不变量

- 右栏由“调试成员名单”变为团队主页：身份、动态 / 资料、工作环境、底部运行详情。
- 团队名由 Agent 自主决定；成员、职责与任务沿用真实 Team 数据，无固定团队类别、固定人数或岗位别名。
- 左侧导航、模型选择、权限、执行调度、成员寻址、会话导航不改。轨迹继续隐藏。
- 不续做已撤回的浏览器原生承载实验；本模块只读取现有浏览器安装状态并保留原入口。

## 实现记录

### 基线（2026-11-16）

- 源仓库 `E:/Workspace/deepseek-harness-local`，基线 `66c432b`，工作树干净。
- 隔离源副本 `E:/Workspace/deepseek-harness-team-panel-20261116`，分支 `feat/naumi-team-panel-20261116`。
- 原有模块测试 52 / 52 通过。首次工作树自动 CRLF 转换导致字节一致性断言失败；只对新工作树恢复 Git 原始 LF 后重跑通过，保留首次记录。
- `agentTeam` 已包含成员和任务；团队成员名由 Lead 创建；没有团队级显示名称字段。
- 原 Schedule UI 提供共享 catalog、CAS 修改与详情入口。浏览器 `installed` 不是页面已连接；桌面工具 `ready` 不是所有操作已验证。

### Agent 团队资料

- 新增 `plugin:naumi/team-profile` 完整状态记录，使用 Session 插件记录接口与现有持久化检查点。
- 新增 `naumiTeamProfile` 投影：`teamId / revision / name / updatedAt`，默认名称为 null，界面只显示通用栏目标题。
- `team_profile_get` / `team_profile_update` 只在真实 Team Agent 作用域注册；Lead 自主命名，成员可读，更新校验精确调用者、revision、长度与控制字符。
- 不接受客户端传入 teamId；teamId 来自现有 Team membership。持久化成功后才报告更新成功。
- 每队串行 CAS；fork 忽略其他 teamId 的继承资料；非法记录 fail closed；没有网页写入接口。
- 提示只指导 Agent 在组织真实团队时命名，不自动发送用户消息、不自动创建团队成员。

### 右栏（开发中）

- 使用原生 Session 投影与状态；成员导航与文件入口继续调用原动作。
- 复用原生 Schedule catalog 和编辑器，避免另建调度状态源。
- 原始企业协作前端除安装点以外维持字节等价；CSS 仅作用于右栏。

## 验证 / 交付（待执行）

- 模块完成后统一测服务权限、CAS、持久化回放、不同会话、订阅释放与 UI 操作。
- 实际本地界面检查与安装包文件清单检查。
- 原始 SHA-256、补丁、修改文件归档与独立副本回滚验证放入 `evidence/naumi-team-panel/`。
- 更新本节为最终观察结果，区分 fixture、真实服务与模型实际调用。

## 边界

- 业务团队跨主会话的组织实体不在此轮扩展；资料严格属于原有主会话团队。
- 语音对话未接入，不摆放音色或实时通话假控件。
- Schedule 投递记录不等于任务执行成功；运行状态不等于交付验收。
