# 复用优先规则

## 模块与职责

本切片只更新仓库协作规范，要求功能开发优先复用已有组件、公共接口和生命周期，避免群聊与原有会话维护两套基础交互。负责人：本线程。工作树 `E:/Workspace/naumi-group-task-feedback`，分支 `codex/group-task-feedback-20261117`，基线 `86a29bbf7f3f5fe1a311d517d37fc2c0105a7acd`。功能迭代计数 0。

## 公共接口、依赖方向、数据/状态/事务归属

没有修改运行代码、数据库、模型配置、服务或安装包。规则位于根目录 `AGENTS.md`，仍引用 `docs/AGENT_COLLABORATION.md`，适用于本仓库后续开发。

## 本次实现与迁移状态

- 增加“复用优先与界面一致性”章节：先检索，直接复用优先，slot / 组合 / 薄适配次之；新增实现须有明确缺口及迁移说明。
- 明确群聊 dock 应复用原生基础组件和行为，而非复制外观；点名、成员路由与任务关联属于场景扩展。
- 明确保留无关图标、导航与模型位置；复用验收须覆盖原有会话和后台任务隔离。
- 代码核对：`assets/bot-groups.js` 当前仍自行渲染 `.nbc-composer`、textarea 和发送按钮，不是原生 dock。原生入口是 `conversation.composer.bar` 及其 `conversation.input.*` / `conversation.composer.dock` 扩展点，依赖真实 Session scope 和 input machine。不能仅换 CSS 就宣布复用，也不能把群消息直接送进任意成员 Session 绕过群持久化与路由。

## 验证命令、结果及证据层级

规则内容、现有相对引用、Git 差异与副本回滚验收见 `evidence/reuse-first/VERIFICATION.txt`。仅文档层验收，不重启、不部署、不调用模型，不增加功能迭代或成功发布计数。

## 未完成项与下一步

群聊 dock 原生复用尚未实施；群聊到独立任务的即时状态、进度、回传桥接及同任务修订仍待原功能切片继续。先明确原生 composer 的 Session scope 与提交扩展契约，再接入群持久化路由；不得全局劫持原生发送、复制输入状态机或放宽原任务 sourceSessionId 写入隔离。

## 主线同步

规则提交 `da227b2` 后整合 `origin/main 825ae6ae05c694eacbb9615e1b9c02824b6f8083`，同步结果 `ab8df13`；保留账号登录与品牌线程全部变更。整合后规则 6 项及协作引用复核通过，功能迭代计数仍为 0。
