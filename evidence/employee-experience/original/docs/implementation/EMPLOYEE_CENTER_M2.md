# M2 员工中心、目标与交付验收

日期：2026-11-16。实施模型：GPT-6.1 Sol。总目标仍为 active；本模块不代替 M3 企业授权/同步或 M5 安装包。

## 产品入口与范围

原 Harness main / sidebar.panellist 中增量注册“员工中心”。不替换原侧栏树、模型选择、浏览器、Team 面板或业务登录。刷新时恢复已选择的员工中心；带 session 的 URL 优先打开会话。

- 档案：四个人设/风格字段、字段锁、自动学习、CAS 保存、真实执行器心跳。
- 记忆：搜索、类别/状态、分页、新建/修改/固定/有效期、候选确认/拒绝、删除确认与来源。
- 工作：目标/里程碑、优先级、期限、父级与依赖、状态、交付版本、审核/退回/验收。
- 成长：倒序游标事件、人物设定差异/恢复、包含工作和正文版本的 JSON 导出。

页面为真实 React 组件，所有持久化操作走 owner API；不以静态样例或 localStorage 伪造业务数据。没有新增模型自动运行按钮，创建目标不会自动花费模型预算或执行业务。

## 数据与领域

`employee-work-store.js` 使用 M1 同一 SQLite 事务/审计表，新增 entity type=goal/delivery/artifact/review，不迁移旧 Bot/Session/任务账本。

目标字段：title、description、kind、parentId、priority、dueAt、criteria、dependencies、status、revision。

- 目标父子/依赖同 Bot，拒绝自引用与闭环，包含父级完成所需子目标形成的组合依赖闭环。
- 未完成依赖不允许开始/完成；未结束子目标不允许完成父级。
- 完成叶子目标需要与当前验收条件一致的 accepted 交付，改了标准不能沿用旧验收直接结案。
- completed/cancelled 目标不可再修改；取消不删除证据。

交付字段：goalId、sourceTaskId、businessStatus、version、artifactIds、currentArtifactId、reviewIds、acceptanceCriteria、revision。

- executionStatus 来自原派单任务账本；与 businessStatus 分开。
- 草稿→提交→审核→验收；退回必须写原因，修改创建新正文版本，再次提交审核。
- 验收需逐项检查冻结在该交付版本上的条件，旧 revision 不能审核。
- 每版正文不可变；保存 filename、UTF-8 bytes、SHA256，下载再次校验哈希。
- 本轮交付物为可打开/下载的文本文件（Markdown/纯文本等）；视频/图片二进制管理继续使用原企业资产系统，后续与服务端共享资产集成，不伪造已支持。
- 审核记录包括当前 artifact/version、操作者类型和时间，退回不覆盖历史。
- 人工验收反馈形成 procedure candidate，不直接升级为 active 经验。

## 权限边界

- HTTP 复用 Harness owner admission，写操作要求同源与自定义 header，严格字段、大小和版本校验。
- Agent 工具：employee_work、employee_delivery_create、employee_delivery_revise、employee_delivery_submit。
- Agent 只能创建/提交自己的草稿，无开始审核/验收工具；不能接管同 Bot 另一会话或 owner 创建的草稿。
- sourceTaskId 若提供必须属于当前 Bot、且 Agent 需要是该派单任务的精确执行 Session。
- 本地审核者标记 local-owner，不伪装成 Naumi 企业组织服务器已经批准。

## 接口

GET `/naumi/employee-work?botId=...`：目标与交付摘要。

GET `view=delivery&deliveryId=...`：全部正文版本元数据、当前正文和审核记录。

GET `view=artifact&artifactId=...`：owner-only attachment 下载，返回 X-Artifact-SHA256；文件名拒绝路径/控制字符。

POST 同一路径，header `x-naumi-employee-work: 1`：goal_create / goal_update / delivery_create / delivery_revise / delivery_transition。

```json
{"action":"goal_create","botId":"BOT_ID","operationId":"goal-1","title":"完成公众号文章","criteria":["正文完整","引用来源可核验"],"priority":2}
```

```text
Agent：employee_work → employee_delivery_create → employee_delivery_submit
Owner：开始审核 → 退回原因 → 新正文版本 → 再提交 → 逐项验收
```

员工数据接口扩展 memory.kind/offset 与 timeline(before,limit)，旧 history(after,limit) 保留；事件增加 type 便于真实版本恢复入口。

## 界面与验证

隔离 Chromium 使用实际 Harness 壳和候选组件，连接真实 SQLite/HTTP 测试宿主，不修改员工生产数据、不启动模型。完整交互验证档案保存、字段锁、记忆固定/有效期/候选审核/删除、目标编辑、版本退回与验收、旧正文真实下载、结案、档案恢复及导出，并检查 1000/760/520px 布局。

调试中发现并修复：React return 逗号表达式导致空页面、历史事件未暴露 type 导致恢复按钮缺失、下载导航取消问题。最后下载改为 authenticated fetch + 双哈希校验 + Blob 下载，不绕过 owner admission。

最终测试/真实运行加载/回滚收据见 `evidence/employee-center/VERIFICATION.txt`。

## 后续总目标

M3 将这些 local-owner 数据接入企业租户、设备、同步与签名离线授权。M4 才引入主动规则、成本预算、执行归属/租约与模型通道容灾。M5 再统一构建带 Logo 和插件的安装包，不拿开发工作树代替员工安装验收。
