# D3 原生文件版本与业务验收

模块与职责：复用 BotTaskStore/原生文件快照及 EmployeeWorkStore，完成 task/attempt/Session/message/turn/file 与人工验收精确绑定。本线程独占 employee-work/store、新 employee-task-files、center/model、bot-tasks 仅公开原服务、package 仅新增模块清单及对应测试/脚本/证据。基线 main/origin/main 2cb250f0b7c107901a8a0e4891a985139046309a，分支 codex/work-file-acceptance-20261118，独立 worktree。企业、模型、安装器保持原状。

公共接口、依赖方向、数据/状态/事务归属：现有任务服务只增加公共 naumiBotTasks 注入点，员工工作服务订阅原账本提交，不启动第二个任务运行器。任务完成且原生文件快照校验通过后，自动在原 SQLite 形成待人工审核文件交付；模型结束不等于业务验收。原 .naumi-deliveries 不可变快照为字节权威，不复制为 Markdown、不由客户端提交任意路径、不读取源模型凭据。

调研缺口：现有业务 artifact 仅支持32000字符文本；源任务只关联taskId，无attempt/message/文件快照。原TaskCard已有真实二进制快照及历史，但与目标页的人工验收互不关联。复用现有 capture/verifyVersion、inspectBotMessage 和原表单/审核状态，不另建上传器或审批账本。

设计：文件 artifact 保存原生ref集合、taskId/attempt/targetSession/message、当时Goal revision/criteria与集合摘要；review固定当前artifact与来源。退回后同任务新attempt自动形成同delivery的新版本；已提交/审核/验收版本不被后台覆盖。读旧版/下载/提交/验收重新核验原Session事件和已保存快照，原工作文件删除仍可下载，篡改或错误来源阻止验收。原任务JSON与SQLite不是分布式事务：异步只读验证后在SQLite提交前同步复核任务身份/轮次/引用，稳定来源操作键支持崩溃后对账，无模型或工具重放。

本次实现与迁移状态：源码已实现，集中验证通过，待主线/实际加载；既有文本交付兼容，原记录不改写，旧文件无snapshot不伪造历史。模块迭代0。

验证命令、结果及证据层级：基线 `node --test tests/naumi-employee-work.test.mjs tests/naumi-work-goal-task-links.test.mjs tests/naumi-bot-file-versions.test.mjs` 24/24 exit0。完整模块后集中验证，来源和写入只用隔离任务。

未完成项与下一步：实现自动待审文件交付、版本下载/审核与UI；覆盖真实二进制、多文件、返工、篡改、权限、并发、重启/回包；四件套、主线、加载。整体Goal继续active，最终包含所有切片的新安装/更新分发仍需完整验收。

## 实现进展

公共接口只增加 `naumiBotTasks`（原BotTaskService对象），员工工作服务用原store订阅和runtime.snapshot/verifyVersion。完成文件任务在SQLite同事务保存file artifact/待审delivery/submit review/稳定operation收据。源 task/attempt/message/session/turn/seq/index/Goal revision/criteria与原snapshot绑定，审核保存artifactSha256和同一来源。原工作文件不复制为文本，原生快照仍是字节权威。每次下载只返回已重新验hash的Buffer；审核/验收验证整组文件，原工作文件删除不影响旧快照。

退回后新attempt发布同delivery的version2；submitted/in_review/accepted的版本不被后台覆盖，后续明确续办产生独立新待审交付。文本交付保留并补agent当前attempt/message/session来源，手动文本不冒充二进制来源。旧无snapshot、来源不符、目标暂停/变化、异步期间任务轮次变化均拒绝发布，不伪造迁移。原JSON任务账本与SQLite非分布式事务，异步验证后、SQL提交内再次核对原任务与当前Goal。

后台不调用模型、不继续/重试业务任务，只对已提交的原生输出做幂等登记；启动通过稳定来源收据对账。单任务失败进入owner可见fileDeliveryIssues，原界面“重新核对文件”只重读/核验，不派单或重放。整组文件审核有公共verifiedCommand薄入口；已成功但丢回包的同operation先回原收据，后续文件损坏不会伪造第二次验收。新的审核/下载仍重新校验。

原生TaskCard在文件交付详情中直接复用。文件版本链接按真实ArrayBuffer校验并下载，不经TextEncoder/Markdown改变二进制；现有文本下载仍兼容。source轮次与集合摘要在审核记录中可核验。原模型、输入框、图标、导航、企业模块保持现状。

模块集中验证38/38，包括24项基线+14项新增；初轮失配来自Zod解析重排对象key顺序，已用语义规范化比较来源ref而不是依赖JSON对象key顺序，失败日志保留。全仓798/798、0skip。原生壳首轮12项（真实PNG、present、版本下载、退回同task/Session attempt2、丢验收回包重试、逐项验收、1360/390布局），现追加宿主重启与旧版本取回后集中最终验收。实际模型为隔离loopback，真实供应商0。模块迭代1。

最终集中验收：38模块（24基线+14新增）、798全仓/0skip；原生壳14项/2 boots，同task/Session、attempt2、文件version2、真实PNG旧/新字节下载、丢验收回包不重复、owner review精确来源、宿主重启后旧版下载与验收保留。模型连接为确定性loopback，合计7入口请求（包含原生员工执行与主管relay），真实供应商0，不记成7收费请求。ZIP15路径CRC、8原文件恢复/7新增删除、恢复后原24测试通过；源码副本回滚不修改真实业务。主线/加载固定版本以VERIFICATION追加为准。

复用接续指令：
```text
继续D3/D5，复用原BotTaskService和EmployeeWorkStore、原生snapshot/inspectBotMessage/verifyVersion及TaskCard。
每次交付与审核固定taskId/attempt/messageId/Session/turn/seq/index/文件hash及当时条件；file artifact不是Markdown替身。
不重放任务，不自审；未知或文件校验失败保留原账本并阻止新验收。企业保持现状。
接续完整隔离真实日常使用，最终从固定main构建并验证含全部最新切片的安装/升级/卸载/更新。
```
