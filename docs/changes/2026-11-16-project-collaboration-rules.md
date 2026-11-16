# 2026-11-16 项目协作规则落地

## 模块与职责

- 模块：仓库级开发协作规范与文档入口。
- 本次负责人：本任务执行 Agent；独占修改 `AGENTS.md`、`docs/AGENT_COLLABORATION.md`、本记录及 `README.md` 的协作入口。
- Bot、桌面、浏览器等实现继续由原任务负责；本次不编辑业务模块。
- 任务分支：`codex/project-collaboration-rules-20261116`。

## 公共接口、依赖方向、数据/状态/事务归属

- [AGENTS.md](../../AGENTS.md) 是仓库级规则正文；[协作说明](../AGENT_COLLABORATION.md) 说明执行方法；README 提供入口。
- 来源是用户从 Naumi 项目调整后提供的规则，按本仓库文档路径落地。保留最新条款，不引入未要求的其他项目巡检脚本。
- 没有应用公共接口、业务数据、任务状态、凭据或数据库事务变更。

## 本次实现与迁移状态

- 新增 Git 协作规则、集中测试要求和五项模块交接模板。
- 明确短命任务分支、普通 merge、推送后仅清理本任务资源，以及 main 整合与实际上线的证据区别。
- 记录本次开工基线：本地 main `31892c3ad1a422a3e44b03f594addcc25bd544bf`；fetch 后 origin/main `66c432bf4dfa93d82d4219d0813c23c1fb5c83da`。
- 本地 main 当时另有 6 个未进入 origin/main 的桌面/浏览器提交，因此本任务从 origin/main 派生，发布范围仅为规则文档及验证材料；原本地历史保留。
- 功能模块迭代计数：0。业务成功发布计数增量：0。无业务数据迁移。

## 验证命令、结果及证据层级

```powershell
node evidence/project-collaboration-rules/verify.mjs baseline
node evidence/project-collaboration-rules/verify.mjs modified
git diff --check
```

验证属于文档内容、引用、差异和独立副本恢复层；不运行模型、供应商或业务端到端流程，不以脚本成功表示业务发布。

[验证脚本](../../evidence/project-collaboration-rules/verify.mjs) 检查用户条款、相对链接及原 README 正文保留情况。[回滚入口](../../evidence/project-collaboration-rules/ROLLBACK.sh) 只接受带本任务标记的独立副本，恢复原 README 哈希并移除本次新增的三份规则文档。精确结果、命令及四份交付材料记录在本任务 evidence 目录的 VERIFICATION.txt。

## 未完成项与下一步

- 本任务只落地规则；既有 Bot、浏览器和其他功能任务的进度与验收继续由各模块记录，规则变更不代表它们完成。
- Git 整合、远端推送和工作树清理以最终提交历史与交付记录核对；没有本任务业务发布步骤。
- 后续任务按本次规则记录负责人、基线、同步、验证和未完成项。
