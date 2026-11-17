# Bot 文件交付

## 契约与职责

所有常驻 Bot 使用相同文件交付约定。Session 的 `deliverables/presented` 是卡片权威，不由文件名、对话标题或任务结束文字推断。`bot-deliverables.js` 负责登记候选与验证；runtime 调用原生 `workspaceFiles.stat`、Session append/flush；task service 管理输出检查与 outbox，原预览器和 UI 不替换。

### 明确交付

- 首选原生 `present({files:[{path,description}]})`，文件卡片在执行员工本身的会话显示。
- 派单任务可使用 `bot_task_reply({taskId,kind:"result",message,idempotencyKey,files:[{path,description}]})`。只允许实际执行该任务的精确 Lead 提交，不接受由主管/其他会话伪造附件。
- 显式声明校验现有文件并登记原生事件；任务仍等待真实 turn/end，不能在模型仍执行时自报完成。
- 每次最多 8 个最终文件，不为源代码修改和中间产物无差别生成卡片。

### 不依赖模型记得调用 present 的兜底

一个 Bot 回合确实 completed 后，系统检查最终回复中的 Markdown 文件链接和单行反引号路径，且必须匹配同一回合成功的 `write/edit` 工具记录。确认文件仍存在且可读后，补登记 `deliverables/presented`。

这不是扫描整个目录自动交付：未成功写入、其他回合写入、未在最终答复宣布的代码修改、命令字符串、任意提及路径都不会因此自动成为成果。通过 shell 生成、或交付既有文件时，需要显式 present/files；不猜测 PowerShell 命令的副作用。

## 文件型派单与完成检查

```js
bot_dispatch({
  targetBotId: "bot-<真实目录 ID>",
  task: "整理材料并交付一份 Markdown 文章",
  output: "files",
  idempotencyKey: "article-01"
})
```

`output` 缺省 text，兼容旧调用；提示明确要求需要独立文件时使用 files。它属于幂等请求身份，同一 key 改 output 是冲突。当前没有按“文章”等关键词强行分类，避免把仅要求在消息中给建议的请求误判为文件任务。

真实模型回合结束后：

- `delivery.status=ready`：存在经过验证的交付引用；可以完成任务执行，但不表示业务验收通过。
- `missing`：文件型任务没有有效登记，任务 failed / BOT_DELIVERY_MISSING，保留实际文本供检查。
- `unavailable`：文件不存在、读访问失败或超出本任务工作区，任务 failed / BOT_DELIVERY_UNAVAILABLE，不伪装文件交付成功。
- `not_required`：纯文字任务无需文件；原行为保留。

拒绝或缺失后不自动重新调用模型；用户确认后可沿用原任务 ID 执行显式 retry，新的 attempt 清除旧检查数据，不复用其他回合的文件声明。

## 结构化引用与主管访问

任务 delivery 和 outbox 在同一事务保存 `sessionId / seq / index / turn / path / description / version / bytes`。只保存文件引用，不复制文件内容；版本是检查时的原生 freshness token，不承诺不可变文件快照。

回传文字包含原文件的 `dsh-resource://file/session/...` 地址，使用来源会话打开现有预览器，不要求主管再猜一次路径或重新声明。

主管消费对应消息后，在来源事件坐标、原文件和接收会话工作区均校验通过时，登记同一文件的原生卡片。若工作区不同导致镜像卡片被拒绝，来源引用仍保留，可从原会话预览；不越过接收方工作区边界伪造本地交付。不新增不受鉴权的文件 HTTP 下载端点。

登记按来源会话/回合或 relay message ID 幂等。回传失败、重复回传、重启恢复不会重复创建文件、卡片或任务。原生 present 已产生卡片时不额外补同一回合卡片。

## 兼容与迁移

任务 schema v1 新增可选 output/delivery/files 字段，已有任务可继续读取，不回填或重写历史会话。不把历史任务中一段文件路径改成“已交付”记录，避免改变审计事实。

旧代码的 strict schema 不认识新字段，因此**旧版本降级不是仅覆盖源文件即可完成的数据迁移**。本轮 ROLLBACK.sh 只在标记的独立副本验证源文件恢复，实际回退要停机备份并另行验证任务账本兼容，不能删除新增交付元数据或静默清空账本。

## 验证与边界

- 365 项全仓回归通过，含桌面生命周期、原 Bot、员工功能和交付模块。
- 新增 8 个交付场景，使用真实 Cordis/Session schema/HTTP/临时普通文件，执行驱动是确定性适配器，不冒充模型实跑或用户浏览器验收。
- 覆盖自动/显式登记、原生 present、来源坐标、读失败/缺失/越界、旧回合隔离、主管镜像、持久化重开、重复确认与缺失检查。
- 初次全仓检查因独立 worktree 未链接 desktop/node_modules 而出现 electron 模块缺失；补齐依赖目录链接后全仓通过，原失败日志保留。早期 schema/fixture 错误也保留修正记录。
- 本轮不会修改旧文章、历史交付、模型选择、权限或企业登录；本地服务加载、安装包构建与模型/用户实用验收分别记录。

具体命令和基线/修改/副本回滚见 `evidence/bot-deliverables/VERIFICATION.txt`。

## 本地加载与实际模型验收（2026-11-17）

main `84b693a` 的 5 个代码模块已在空闲后加载，运行 package 仅追加本模块 files 条目，其余运行文件未改。真实配置模型完成独立文件派单：未调用 present，员工与主管会话仍分别保存一条原生文件卡片事件，任务与 outbox 保留原始文件坐标。两条测试会话已归档、临时文件删除，结束时无运行任务。

此项证明真实执行和卡片事件链路；不冒充用户浏览器点击或新 EXE 安装验收。历史文章及历史会话没有被补写。安装包清单包含新模块，已发布的 v0.3.2 EXE 未在本轮重建。
