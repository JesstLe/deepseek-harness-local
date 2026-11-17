# Codex / Claude 原生会话导入

模块与职责：本线程独占 session-import*，host/client 仅安装和资产注册，package 仅 files 追加。协作线程已确认不再写这三个文件，保留其总览、工作区、版本清单。独立分支 codex/session-import-20261118；基线 main/origin/main c1552171c9090b720cae201969db75d6a8dd3394。迭代计数 1，源码待集中整合验收。

公共接口、依赖方向、数据/状态/事务归属：本机只读来源 → 标准化快照 → 原生 Session / SessionPersistence 写 handle → Workspace.attachSession → 原生 UIWorkspace.openSession。不直接创建伪 JSONL，不建立平行聊天或 Agent 执行器。Naumi 当前模型、权限和输入器继续负责新消息；历史工具仅文本证据，不执行。来源日志、凭据、Bot、任务、企业数据均不迁移。

调研：Codex response_item 与 event_msg 双重记录同一对话，只取前者，避免重复；session_meta 提供 ID/CWD。Claude user/assistant 通过 uuid/parentUuid 选择最新主分支，sidechain/subagents 不混入。api-request-blob/config/密钥和隐藏思考不导入；附件保留占位及计数，不自动访问文件/URL。已有 system/developer 不成为当前特权指令。扫描只读前2MiB元数据，按需流式读取最多512MiB源文件，标准化内容上限64MiB，尾部未完成行保留长度但不伪造完成消息。

本次实现与迁移状态：开发中。默认读取 CODEX_HOME/sessions、archived_sessions，CLAUDE_CONFIG_DIR/projects，未设置时使用用户目录。仅标准根内常规 JSONL，跳过链接及子代理目录。用户选择已有 Naumi 工作区；不会因源 CWD 自动授权目录。

验证命令、结果及证据层级：baseline `node --test tests/naumi-unified-chat.test.mjs tests/naumi-product-identity.test.mjs` 17/17，exit0。后续按完整模块集中测试，另验原生继续、重启、幂等、来源保护和副本回滚。

未完成项与下一步：导入事务/收据、浅色原生入口、测试/隔离 UI、主线整合与运行加载。D5 最终安装包需包含本模块，既有0.3.6候选不据此改写为包含新功能。

## 实现与可靠性

已增加 owner-only `/naumi/session-import` discover/preview/import，意图头、同源、8KiB请求体及严格字段校验。前端在侧栏底部注册导入入口，两栏浅色预览，窄屏上下组合；不替换原图标/导航/模型位置。使用原生 `sessions.refresh()` 刷新权威目录后 `UIWorkspace.openSession`，继续使用原输入器及 Session 控制器，只有用户新发送才执行。

原生 `Session.append` 生成合法事件和 surfaceOp，再由 SessionPersistence.create/open 的写 handle 单次批量 append/flush/close；Workspace.attachSession 完成工作区归属。没有把历史工具写成待执行 tool/call，也没有历史权限、旧模型、API key、system/developer 或 pending inbox。导入用户消息的 source 为 recall，而不是当前 owner 的新证据；历史助手 source 明示 imported-provider/transcript。line/sourceId/time → seq/messageId 映射留存在导入计划。

每个 sourceId + 已选择工作区的规范路径有固定 Session ID、原生事件摘要、标准化快照摘要、计划与收据；源路径不是请求输入。临时文件先fsync再独占发布计划。源变动必须重新预览；已导入后外部追加不覆盖 Naumi 会话，明确显示已导入快照/来源更新。计划、flush、attach 后中断可重试原计划，源后来更新/删除也能预览原快照并收口，不生成第二个 Session。外部改动目标前缀则拒绝，不覆盖历史。写 handle 持有期间原生单写者约束有效；初次JSONL materialize由现有后端实现。源码副本回滚不会删已导入的会话和来源，普通原生消息可继续读，旁车计划/收据应保留以便审计。

预览每页最多100记录、每块最多16000字符，节选明确显示；完整支持文本仍进入原生历史，不以预览截断替代导入。最多512MiB源、64MiB标准化内容、16MiB单行；完整合法无换行尾行保留，非完整尾行只记录长度并要求确认。附件、未知记录、其他分支须显式确认；API请求blob/运行配置/隐藏思考不迁移，来源原文件仍在。当前仅标准JSONL支持，不宣称附件内容/所有历史版本协议均原样迁移。

## 已执行验收与修正

- 模块26/26，真实 Cordis + 原生JSONL持久化 + owner HTTP；计划/flush/attach中断、丢回包/并发、源变化/缺失、权限/工作区、损坏行、体积、分支、分页与摘要完整性。
- 隔离实际 Harness/UI：17 checks、2 boots、native loopback模型1请求、真供应商0。重启前后历史工具/输入0自动执行；明确新输入才调用当前原生模型，历史文本和工具证据进入新请求。来源hash保持。
- 本机仅只读格式核验：Codex 25,208,427字节/1461记录、Claude17,941,604字节/289记录，两个源hash保持；没有导入真实会话或读取凭据。
- 首次module测试fixture误用Context.dispose、随后空seed自动追加end-seed未计入原生序列：修正为持有plugin disposer和无seed构建，失败日志保留。
- UI首次发现Workspace observable方法需要保留this；随后发现原生目录未刷新导致unknown session。已通过公共 `sessions.refresh` 修正，不注入自造缓存或改私有状态。
- 第一次全仓782/784：旧UI测试未扣除新面板白名单，且编辑器CRLF破坏字节断言。只更新精确允许的面板字符串并恢复LF，原导航SVG哈希不变；19项定向复核通过。截图检查发现390px按钮裁切，已改minmax(0,1fr)并增加真实按钮边界断言。

## 运行加载设计

实际安装的host/client/package包含较早可选模块，和main整份文件不一致。本切片不顺带加载身份、企业、钉钉或创作模块。`session-import-carrier.mjs`只在现有carrier精确插入安装/资产/入口/白名单，删除这些新增字节后必须等于原文件；package只追加两个新后端文件且其他字段语义相同。先在隔离原生Harness验收这个真实carrier副本，再从main按固定源版本增量加载7文件。任何无关运行文件、模型组、员工导出、任务/群账本、权威会话日志、其他线程证据保持；他人日志只允许原字节前缀不变的末尾追加。真实运行仅只读discover，不创建导入会话、不发模型。

## 复用接续指令

```text
继续SESSION_IMPORT：只读标准来源，复用SessionPersistence写handle和Workspace、sessions.refresh及原生UIWorkspace。
不复制输入器，不自动执行历史工具，不转移旧模型/权限/API key，不把imported recall当作新的owner指令证据。
保留计划/收据及来源指纹，丢回包或重启沿同一Session恢复；企业模块保持现状。
先读本模块证据中的未完成项，从固定main构建包含所有D1-D4和导入的最终安装版再验安装/更新。
```

未完成项与下一步：整合最新主线后全仓、已安装carrier隔离验收、源码副本回滚、main合入及运行加载。最终安装包/真实供应商链路与业务文件版本精确绑定仍属整体Goal，不用本模块通过替代。

副本回滚首次已恢复源码哈希，但测试副本漏复制原有scripts和启动脚本，导致原测试依赖不存在；已补齐副本依赖，失败PACKAGE_FIRST/ROLLBACK_TESTS_FIRST原样留证，未修改业务实现以绕过测试。

## 集中验收收口

同步记录：c155217基线 → 实现9b201e6 → 普通整合origin/main 8cb6b63得到efe6a55，后续仅补测试副本依赖/证据脚本。完整功能计数1；企业功能计数0。

整合树全仓784/784（0 skip），源UI17项、实际已安装carrier的隔离UI17项均通过，分别2 boots/1 loopback请求/0真供应商。主模型位置、原SVG哈希与原输入器保持。源码副本回滚6原文件恢复/11新文件移除，原始17项测试通过，当前修改源文件仍保留。第二次副本测试漏desktop/package.json，同为副本依赖遗漏，已补齐，原失败日志保留。四件套及manifest记载精确命令与层级，最终主线和运行回执在VERIFICATION/DEPLOYMENT追加。

当前本模块剩余：源码合入推送、7文件运行加载、四件套最终重开与清理。整体Goal继续active，后续审视D3文件快照/attempt与业务验收精确绑定、完整真实使用、最终新版本安装升级与更新分发；已公开0.3.6不是包括本模块的新版本。

## 主线与实际加载完成

源码已普通合并并推送main 0070f4bdfb7bd9aab5f05795da789770cac1d411；从该固定提交执行 `node scripts/deploy-session-import.mjs apply E:/Workspace/naumi-desktop`，exit0，SESSION_IMPORT_LOADED files=7 http=200 running=0。104 sessions / 4 bots / revision47保持；143无关运行文件、113权威会话/配置文件、44其他未跟踪证据保持，模型组、员工export、任务与群账本一致，真实模型0/真实导入0/来源写入0/企业配置变化0。host/client为已验收薄增量，package只追加2files，未顺带覆盖旧可选模块。窗口已释放。本模块源码/主线/隔离原生链路/运行加载/副本回滚已收口；最终包含本切片的新安装版仍在整体Goal后续。
