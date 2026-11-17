# 远端群聊与任务交接同步

## 模块与职责

本线程负责同步与集成验收，不重做远端功能。共享本地基线 `ea0235b637cfd7ddf290b3daa7d16bc5fad5eb09`，远端 `b4b0bd4730ea5204553510b8d56654cbacc29f61`，独立分支 `codex/sync-remote-bot-groups-20261117`、工作树 `E:/Workspace/naumi-sync-remote`。共享 checkout 干净，另有 m55 worktree 保留。功能新增计数 0；同步覆盖 Bot 群聊、历史检索、交接及已合入远端的快捷方式修复。

## 公共接口、依赖方向、数据/状态/事务归属

- 群聊由 `/naumi/bot-groups` owner 同源接口及 SQLite 保存；消息、成员身份与群任务投影复用远端实现。
- 交接由原始发送会话调用 dispatch，携带 handoffTaskId/revision；旧任务/outbox、原生 Session、交付文件继续归原模块持有。既有 JSON 边界和精确原会话写权限保留。
- 仅将 15 个运行文件增量加载：两个群聊资源，群服务/存储/入口、handoff、Bot 入口、四个 task 模块、交付模块，以及 host/client/package。
- 运行 host/client 与 Git 主线存在部署差异（原生企业账号/连接、额外模块注册等），不全覆盖。host/client 仅加入群聊注册和面板；package 仅追加四个新增文件条目，保留所有现有 peers/files。其余后端要求与本地旧基线归一化字节一致才替换。
- 同步不改 URL/API Key、模型选择、员工导出、原任务账本与压缩 Session 日志，不派业务任务、不创建真实测试群、不调用模型、不构建/安装 EXE。

## 本次实现与迁移状态

远端主线首次全仓 499 项：495 通过，4 失败。两个旧测试仍按群聊前的 UI 和非结构化 amendment 比较，已改为限定新差异并验证结构化正文/实际账本一致；没有放宽其他旧 UI 等价检查。快捷方式脚本对 Get-Command 的多个命中隐式拼接，导致 GUI launcher 的 FileName 不存在，改为选择第一个真实可执行文件，真实隔离快捷方式测试增加文件存在检查。桌面 delayed-bootstrap 测试在全仓随机端口启动时失败，单独重测通过；改用操作系统分配端口并保留子进程 stderr 诊断，不改变产品启动语义。

仅负责上述集成修正：scripts/install-naumi-shortcut.ps1、对应三组旧断言、desktop/tests/backend.test.cjs；另外新增 delta 加载/核验/归档脚本和本记录。快捷方式修复同步源码，但不擅自改用户桌面快捷方式。新群 SQLite 是新功能自身的存储，不迁移或覆写旧业务账本。

## 验证命令、结果及证据层级

- 旧共享主线全仓 `node --test tests/*.test.mjs desktop/tests/*.test.cjs`：484/484，exit0。
- 集成失败记录、35 项修复定向、31 项 backend 定向及最终全仓结果保留在 evidence/remote-sync。
- `node scripts/verify-remote-sync.mjs baseline <旧运行插件>`：group/handoff absent，原任务隔离保留。
- modified 核验实际模块导入、群注册和真实临时 SQLite；副本回滚恢复旧模块可用状态，不操作在线数据。
- 加载前复查所有 Session running=0 且无活动任务，停服后再核对 protected hashes。固定 main 来源运行增量，加载后 owner HTTP、资源文件、任务/员工/模型/原始 Session hash 集中验收，详见 VERIFICATION.txt 与 DEPLOYMENT.json。

## 未完成项与下一步

实际模型多 Bot 群聊和文件交接业务回合不由同步自动触发。本轮核验代码、原生持久化/隔离测试、运行接口及静态资源；不把这些证据写成真实模型任务验收。安装包不重建、不发布 GitHub Release。证据普通合入后清理本任务分支/worktree，保留其他工作树与当前用户服务。
