# 2026-11-17 IM 网关首批交付

## 模块与职责
钉钉 Stream、飞书/Lark 长连接作为 Naumi 原生 Bot 与群聊的外部入口。独立执行工作区 `E:/Workspace/naumi-im-gateway`，短命分支 `codex/im-gateway-20261117`。模块契约与配置步骤见 [IM_GATEWAY](../implementation/IM_GATEWAY.md)。

## 公共接口、依赖方向、数据/状态/事务归属
仅新增 BotDirectory.registerSessionOwner、群服务 onReady/readPost 公共扩展，不触碰原生输入器/模型选择或依赖私有状态。IMStore 拥有独立 SQLite；凭据归既有 credentials。外部消息 → 持久 inbox → 原 runtime/group service → 原任务/交付事件 → 持久 outbox → 原外部聊天。绑定 revision 和原发起人共同约束出站及审批。

## 本次实现与迁移状态
- 配置、验证、启停、一次性配对、成员白名单、解绑/重配、独立私聊 Session 与现有群路由已落地。
- 文本、飞书入站图片、校验原生文件凭据后的双平台出站文件；任务进展与结果按原始消息回传；审批/提问使用原生 waterfall，外部仅一次性短时确认。
- 入站去重与先持久化再 ACK；出站分片、限流重试、重启恢复；UNKNOWN 由所有者核对，不重跑模型。
- 历史 Session 保留 Bot 归属；解绑与授权成员变更撤销旧目的地；/stop 只停止精确聊天回复，不取消独立工作。
- 浅色设置页复用 settings.section，没有新增一级导航、替换输入器或移动模型。
- 第三方适配来源、原始/本地 SHA256、许可证和修改点均随包交付。

## 验证命令、结果及证据层级
- 原生 Bot/群基线 38/38；整合最新 main 后全仓 627/627；IM 定向22/22。
- 真实隔离 Harness Host + SQLite + credentials + 浏览器 UI：15项、0页面错误、0模型调用，1360/580/360布局通过。
- 副本源代码回滚：33文件恢复，原基线38/38恢复；业务数据不在回滚清单。
- 初始失败均保留：一次原生群 fixture 错误读取 deliver.profile（应检查真实 ensure 后 Session preset）；网页快捷键误用；新增丢收据断言误读中间调度状态；首次归档混用了 Git LF 与工作区 CRLF，哈希预检阻止任何回滚写入，改为真实字节归档后通过。
- 固定实现提交 `afb66a3`；主线整合/实际运行最终结果继续写入 `evidence/im-gateway/VERIFICATION.txt` 和 `DEPLOYMENT.json`，不以 Git 合并冒充已加载。

## 未完成项与下一步
未配置真实外部企业应用，真实账号收发、平台权限和文件投递验收待配置后进行。首版未开放钉钉入站图片/富文本/文件、飞书线程、语音/音视频、通讯录/全量历史同步、物理删除与归档策略。保存连接默认停用，不制造真实平台联调成功记录。完整支持矩阵见模块文档。

Git 同步记录：初始 e620bd9 → fetch origin/main 5418301 → 普通 merge 80402a9，保留所有他人代码与工作区。功能迭代计数3；后续证据/文档不计功能发布。运行部署只应用本任务源差异，不覆盖其他模块的运行差异。
