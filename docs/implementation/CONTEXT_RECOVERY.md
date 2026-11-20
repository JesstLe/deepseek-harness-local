# 普通会话上下文超限恢复

## 模块与职责
2026-11-20，`codex/context-overflow-20261120`，基线11fe569。负责原生压缩摘要自身超限时的恢复；新增context-recovery.js，host/package仅追加安装/文件。模型配置、UI、电脑操作、原会话数据不改，不热补CProgramFiles固定资源。

## 调研结论
截图为CONTEXT_WINDOW_EXCEEDED。只读实际普通会话发现483个可见surface节点、770286 UTF8 bytes；91个工具，request header约68427 bytes，声明窗口938384，输出预留16384。原生自动压缩已经启动，但compaction/end记载摘要再次context_too_large，随后原turn/end失败。不是list_windows失败，也不是用户hi本身过长。此前只对导入历史首轮做有界保护，这次是普通旧会话。

## 公共接口、依赖与状态归属
- 复用BasicCompactionEngine公开的实例summarize hook、compactIfNeeded、范围校验、原生compaction事件与surface替换；不改prototype、依赖包或模型请求执行器，不另建输入器/压缩账本。
- 普通摘要按原路径执行；只有精确上下文错误才采用有界原文检查点，明确标注非完整语义摘要。原system/developer/隐藏思考/图片不混入历史节选；当前原生系统头保持。
- 已有未恢复的超限turn在下次pre-step本地恢复，避免再次提交整个历史作摘要；该操作不发模型、不重放旧业务/电脑工具。
- 原生事件、工具回执、原文件保留；原生session_event_search/read可检索被shadow的历史。检查点与当前请求的序号及可压缩边界仍由原引擎拥有。
- 持久化成功才继续下游请求；取消/鉴权/配额/网络错误不伪装成上下文恢复。当前会话小到没有有效缩减空间时保留错误，不制造虚假成功。

## 实现与验证进度
实现一项普通旧会话续聊恢复切片。集中验证包括原失败基线、原生压缩替换、原记录前缀保持、scope生命周期、跨Session、取消与非上下文错误、实际受影响会话副本原生持久化重开、全仓与四工件回滚。结果后续补录。

### 已完成验证
- 全仓集中 `node --test --test-concurrency=2 tests/*.test.mjs desktop/tests/*.test.cjs`：1088/1088，0 skip、exit0。
- `node --test tests/context-recovery.test.mjs tests/naumi-import-context.test.mjs tests/naumi-bot-task-continuity.test.mjs`：32/32。
- 实际受影响普通Session副本，原始1301个持久事件前缀逐项保持；原文件SHA256为`f01c2ae46f77923bdd5f0236cbc2466840d0f35d70f9b80479d1ac27c758bbb9`，前后不变。
- `node scripts/verify-context-recovery.mjs baseline`（原插件副本）：6检查；原生用户请求和摘要请求都超出隔离供应商阈值，最终turn仍error，稳定复现截图的双重超限。
- `node scripts/verify-context-recovery.mjs modified`：10检查、2宿主启动；可见消息770286→43419 UTF8 bytes，首个真实Harness发出的HTTP请求102079 bytes（含系统及88工具），继续成功；重启后98435 bytes，继续成功。
- 上述为真实Harness/AgentLoop/TokenMeter/BasicCompaction/JSONL与实际历史副本；供应商是loopback fixture，0真实供应商调用/0共享服务写入。副本中无任何旧工具call/result重放。
- 最初runner漏考虑Session.create临时end-seed，逐字比较改为原始持久事件前缀；另修测试fixture空tools字段与缺ctx.get，以及runner重复stop等待已退出子进程。失败原样保留，不改业务代码掩盖测试数据问题。
- 只有上下文超限触发本地节选，不把鉴权、配额、超时或其他400转换为成功。检查点始终明确不是完整语义摘要；历史仍通过原事件和原生检索可回查。

本切片只改3个产品文件（新增context-recovery，host/package追加），不复制摘要执行器。scope创建/首次pre-step兼容原生延迟实例化，最后一个owner释放时恢复原实例hook，未知第三方compactor保持原路径。

## 未完成项与下一步
当前为独立源码开发；不宣称运行已加载。既有实际会话仅只读，用户下一次发送才经修复链继续，不自动重发hi。固定安装包需后续完整构建纳入；真实供应商不为复现再次调用。
