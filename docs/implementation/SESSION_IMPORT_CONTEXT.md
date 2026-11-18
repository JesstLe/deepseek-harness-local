# 导入会话上下文与旧原生头修复

## 模块与职责
负责人：本线程；分支 `codex/import-context-budget-20261118`，基线 `5154aecf729d6b9155050f25403122a2b0906ace`。独占 session-import 上下文/精确旧格式修复、定向测试与加载脚本。原 host/client、Bot任务、模型配置、设置/侧栏/图标不改；package只追加2个files条目。

## 调研结论
- 实际受影响快照667条消息、3,484,000 bytes标准化JSON，单条507,505字符。原计划将全部内容作为原生可见surface，未区分存档和发送上下文。
- 原生BasicCompaction首轮无request/header会跳过压力判断；溢出恢复的摘要仍携带整个大前缀，再次超限。仅显示预览节选、增大模型上限或重发原提示都不解决根因。
- 实际旧日志还缺V4要求的首个受保护system surface head；首轮系统提示追加后，严格重开报 `system/message requires a protected first surface head`。修复同时覆盖新导入及这份已受影响记录，不能只让内存中的一次调用通过。

## 公共接口、依赖方向、数据/状态/事务归属
- 所有原文继续保存在既有Session事件和原导入plan快照；不删来源记录、不把历史工具重放为执行。
- 导入Session的pre-step在首次发送前，按当前模型能力保守计算UTF-8字节预算，对超长导入span调用原生BasicCompaction.compactRegion。原生引擎拥有边界/锁/事件/替换/失败处理；调用级facade仅提供本地有界节选，不改prototype、不拦截LLM、不建第二套聊天执行器。
- 本地检查点明确标识为“有界原文节选，并非完整语义摘要”，优先来源压缩摘要和近期对话。不是宣称无损语义压缩；需要细节时模型用 `session_import_history` 按关键词、消息索引、文本偏移分页读取原文，工具结果限量，且只属于执行者当前导入Session。
- 已有压缩策略保持；普通导入Session缺省没有引擎时，在Agent生命周期中复用原生BasicCompaction与TokenMeter，保留后续原生自动压缩。首轮导入检查点无需模型调用，暂停/取消和缺依赖不回退为发送全文。
- 新导入先写一个空的本地受保护系统头及完整闭合生命周期，不导入来源system/developer权限。
- 旧格式规划器只接受原plan前缀完整匹配、已审阅事件类型、无未知surface替换/序号引用的精确旧导入。原消息数据与ID保留，仅插入5个空锚点事件，原seq+5、turn+1；回执保留映射。拒绝未知变种，不对所有会话做通用重写。

## 本次实现与迁移状态
实现一个导入续聊可靠性切片。原型及复制验证先行，真实旧文件修复必须在运行窗口内备份、校验原SHA、原生副本解码/重开通过后CAS发布。禁止拿摘要覆盖原plan或旧来源。运行加载和实际修改状态以 evidence/import-context/VERIFICATION.txt 与 DEPLOYMENT.json 为准，不以源码合并代替。

## 已验证结果与证据层级
- 原导入基线26/26；新增及相关回归68/68。覆盖首轮无头、旧失败、字节预算/CJK/emoji、缺依赖、取消、原事件保留、同源分页、篡改拒绝、不同Session并发和精确旧头修复拒绝边界。
- 6.4MB合成来源的真实隔离Harness/AgentLoop/TokenMeter/原生压缩/工具/持久化链：3 boots、3次loopback请求，第一次只发送有界检查点；下一次使用原历史检索工具的有界输出；重启后继续。真供应商0。
- 实际受影响会话只在副本先验证：修复原生头后可读；模型可见消息3,532,294 -> 53,564 bytes；原消息ID/内容与所有已修复原事件前缀保持；原生持久化重开通过，原文件SHA保持，模型调用0。此项采用确定性meter，不冒称真实供应商token计数。
- 中间失败日志保留：跨excerpt复用流式TextDecoder导致UTF-8尾部污染已改为每次独立decoder；大DOM浏览器夹具不作为模型边界验证，改为原生HTTP抓包；plain imported Session缺引擎已补原生作用域实例；旧副本Zstd首帧、constructor seed边界已按原生格式修正。
- 原小UI390px布局用例本轮报溢出，UI/CSS未修改，不据此宣称全套浏览器UI通过；本切片的上下文、原生继续与重启由实际HTTP/native链核验，原失败保留。

## 未完成项与下一步
实现已普通合入并推送 main `63e98bfa2adc3ed3e399598e2428395916e79931`；从该固定 main 完成4文件最小加载与1份精确旧会话原生头修复，HTTP200、PID39012，114 sessions / 0 running / 4 bots / revision49。168个其他插件文件、123份受保护会话/配置原字节保持，Bot/tasks/groups/模型/员工导出哈希一致，原plan/receipt不改。原会话备份留在共享runtime，不随任务worktree清理，SHA256为 `14e4464fc82f5a8faf33da932e06572aa1c7fb350895df56025c140bad97e8f0`。本次生产加载只修日志结构；有界上下文检查点在用户下一次发送前由原生pre-step持久化，未擅自重放原提示。

整合后集中全仓 `node --test tests/*.test.mjs desktop/tests/*.test.cjs` 为899/899、exit0；定向68/68。四工件/副本回滚以VERIFICATION与PACKAGE回执为准。离线节选不替代完整语义摘要，其他来源协议或未知V4变种另行验证。未发真实供应商请求，不为验证自动重发用户“hi”；用户下一次明确发送时才经当前模型继续。390px既有导入布局检查未通过，保留失败，不宣称UI全通过；本任务没有修改UI/CSS。

## 同步、计数与运行窗口
基线5154aec → 整合b2156a7/c5d4869 → 任务829b29b → 固定发布main63e98bf。完成1个功能切片，文档/证据不增加功能计数。加载前两次检查0 running/0 active tasks、无其他runtime锁；加载完成释放窗口，不再重启。运行只追加2个package files，保留模型连接、品牌与其他模块注册。最终证据提交不改变运行代码。
