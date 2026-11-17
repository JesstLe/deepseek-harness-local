# D1-D4 隔离真实使用验收

模块与职责：本线程只新增真实模型验收runner/证据/文档；如实测发现缺口再最小修复原模块。基线 main/origin/main dd5ac377e3fc0806ba6bb668a94dd067234c1585，codex/daily-real-acceptance-20261118 独立worktree。企业/账户/安装器/现存任务不动；不启动代理或新线程。

公共接口与状态归属：继续使用原生Session/AgentLoop/工具、BotTaskStore、EmployeeWorkStore和原本地主动消费者；隔离home/随机端口/独立员工与工作区。只读选中模型组配置，密钥只进子进程环境，不写fixture或日志，不切换模型/供应商。转发原实际模型响应，不以确定性端点替代自然决策。入口请求计数与持久模型响应及真实计费分别记证。

设计：自然目标提议→owner确认→真实主管带Goal派单→员工读本地CSV生成两个文件→owner退回并确认新条件→原task/Session attempt2→owner核验新版并接受→确认复盘候选→重启后新会话检索复用。随后owner明确批准一次本地规则，真实模型检索经验保存草稿；默认停用/无事0请求/一次后不重复；只对隔离请求故意截断真实上游流，观察UNKNOWN、无自动重放、owner停止核对及重启保持。所有写入均为独立fixture，不对3080调用写API。

本次实现与迁移状态：runner开发中，无数据迁移。人工审核由owner API模拟明确测试步骤，不让模型自审；文件实际内容/来源/字节/旧版均核验，失败保留原证据，不自动重发原prompt。

验证命令、结果与层级：baseline node --test tests/naumi-work-file-acceptance.test.mjs tests/naumi-local-proactive.test.mjs tests/naumi-employee-continuity.test.mjs，37/37 exit0。真实运行需显式 --live，--prepare 仅核对当前配置、0推理。上游单请求120秒界限、当前模型输出4096上限（失败旧case为1536）、最多64入口请求；观察超时继续同一handle，不因等待时间重启宿主。

未完成项：真实贯通执行与缺口修复、集中回归/四件套/主线；最终新安装包与更新分发在此验收后继续。Goal active，企业保持现状。

## 本轮结果

第四次隔离case live-1794941925162：exit0，DAILY_LIVE checks=21 boots=3 supplier_entry_requests=54 same_task=1 attempt=2 versions=2 actual3080_writes=0 config_changes=0 credential_disk_writes=0。真实CSV两版精确解析验证25/2760、31/3480，4份文件字节/hash重开；同task/Session、人工退回/验收与记忆候选确认、重启检索、本地批准一次草稿、真实断流UNKNOWN及owner核对停止/重启保留均通过。

统计：全隔离home 51条持久原生assistant响应；54仅入口请求（含辅助）；runner turn子集12条不是全home数，供应商权威计费未观察。前三个失败case与后续公开native事件投影均归档。audit初版将文件+补充文本artifact混为5项，已纠正为仅2个files版本并另列3文本artifact，不抹除原失败。

实现缺口与修复详见[工作区沙箱](MANAGED_WORKSPACE_SANDBOX.md)。新建工作区权限最小初始化、原生目标提议独立section；48定向与804全仓通过。原日志中.NET受限调用错误的stdout不是写入证据，最终真实Set-Content和跨目录/DACL负向测试才作为边界验收。

未完成：真实模型仍创建额外3个补充文本artifact（文件集合和验收本身正确）；需收敛文件任务交付写入路径，保留历史不自动清理。当前实现待源码副本回滚/四件套/主线和必要实际加载；D5新版本安装包/更新分发仍未完成。企业配置/原模型组/真实业务保持现状。
