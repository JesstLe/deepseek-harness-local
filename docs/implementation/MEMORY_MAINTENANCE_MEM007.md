# MEM-007 记忆整理、导入与遗忘

2026-11-16；GPT-6.1 Sol。实施代码：`employee-memory-maintenance.js`；员工中心 → 记忆 → 整理记忆。

## 行为

- 预览是只读：返回精确重复组、各条来源、过期记录、当前条数与 tombstone 数。没有模型调用、目录扫描或未经选择的私人文件导入。
- 精确合并只比较 kind、正文、状态、有效期、人设候选的相同值；正文只去外沿空白、统一 CRLF，不折叠代码缩进或 Unicode 字符。不同事实、确认状态、期限或人设提案不可合并。
- owner 选择保留条目并确认；保留条目固定状态取并集，保存所有来源引用；其他条目写 deleted + mergedInto。审计与正文原件保留，不物理清空历史。
- 过期整理必须明确选中并携带当前 revision；任一条尚未过期、版本变化或存储失败，整批回滚。清理后不再检索/注入，原始聊天保留策略不变。
- 导入 JSON 一次最多 100 条、UI 文件最多 100 KB；先显示新增候选/跳过重复数量、正文和来源，确认后才写入。所有导入都是 candidate，不伪造 genuine-user 来源；原文件来源存入 importSource，待 owner 核实后确认。
- 同一 operationId 保持幂等；同 Bot 引用、CAS、容量上限、凭证模式检查继续生效。凭证检测覆盖已知模式，不宣称识别所有秘密。
- 同步 payload 扩展为 mergedFrom、mergedInto、importSource；服务端严格 schema 保留这些来源元数据。真实双设备验证：合并后保留源引用，另一设备收到删除标记，不复活被合并条目。

## 验证

- Harness 172/172 完整回归；新增六组维护/HTTP/失败原子性测试通过。
- 企业端 206/206、TypeScript noEmit；临时真实 PG + 双 SQLite + Windows DPAPI，覆盖本轮来源链同步。
- 8 项真实壳/隔离真实栈浏览器操作：登记、显式同步、禁止自审、窄屏、合并、过期清理、候选导入、0 页面异常。
- 实际已部署工作台只读验证：维护页/API 可用，anonymous=401，真实员工 mutation=0。
- 四件套：`E:/Workspace/naumi-design-ops-digital-employees/evidence/employee-memory-maintenance/`。副本回滚 restored=8、removed=2，M3 同步/M2 页面保留。部署前发现 Git LF 与运行版 CRLF 的纯行尾差异：同时保留 Git base hash 与运行原始字节/hash，不以规范化哈希绕开防覆盖检查。

## 尚未做

语义相似、事实冲突推断、自动摘要和永久删除保留期未引入；摘要/索引仍可从原记录重建。当前条目数包括 tombstone，达到容量时明确报错，后续扩容/归档必须保留审计，不悄悄删除来源。

企业任务/资产/审核权威衔接、M4 执行门/主动规则/预算/模型通道/租约、M5 安装包仍在总目标中，继续推进。
