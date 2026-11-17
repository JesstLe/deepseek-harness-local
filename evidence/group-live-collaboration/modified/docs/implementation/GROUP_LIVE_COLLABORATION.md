# 群内异步协作与原生输入区

## 模块与职责

负责人：本线程。独立分支 `codex/group-live-collaboration`，工作树 `E:/Workspace/naumi-group-live-collaboration`；基线 `7f823fe361d082635684c135ce5fdfe3b2e3db18`。本次为一个完整群协作切片，功能迭代计数 1。文件范围：群存储/服务/HTTP、任务 Runtime 与执行提示、群 UI/model/CSS、enterprise client 的群主区注册、原生 composer 扩展生成与装配、定向测试及本模块证据。不调整图标、品牌、模型配置或其他业务模块。

## 公共接口、依赖方向、数据/状态/事务归属

- 群 SQLite 仍拥有用户群消息、点名路由与逐成员回复；任务账本仍拥有 task ID、attempt、revision、状态、outbox 和文件引用。群不维护第二份任务状态，不向真实业务账本插入展示用任务。
- `GET /naumi/bot-groups?roomId=...` 追加 `activity`，把该群原派单 Session 的真实任务状态和目标 outbox 投影为时间线。进度不唤醒主管；结果仍通过原生 next-turn 回原来源，UI 以精确回传 message ID 读取主管后续答复，避免其在群里消失。
- 目标首次反应来自真实持久化受理状态以及执行 Agent 的 `bot_task_reply(progress)`；系统状态与 Agent 原话分别显示，不用固定“收到”冒充模型回应。任务提示要求执行者先报告理解和下一步，再继续工作，并在收到新要求时报告具体方向变化。
- 群的日常接待 Session 与独立任务执行 Session 分离。聊天、新话题及停止当前群回复不取消独立工作。同 Session 的模型回合仍串行，不承诺一个 Session 同时执行多个模型回合。
- 用户选择“调整这项任务”后，`post.taskId` 持久化并路由到该任务**原始 sourceSessionId**。模型读取当前 revision 后使用既有 `bot_task_continue`；其 CAS、幂等、重试及写入隔离保持，不能从同 Bot 的其他 Session 越权修改，也不重建任务。自然语言任务多候选时继续要求澄清。
- SQLite 增加可选 `post_context` 侧表，保存任务引用、已准入附件和请求附件标识；原四张表及 user_version=1 不变，旧版忽略侧表。用户消息和路由/上下文在同一 SQLite 事务写入。相同 UUID 的已受理附件重试先匹配持久化请求，不重复消费上传凭据。

## 原生 dock 的复用与最小扩展

上游固定 `@deepseek-ai/dsh-client-ui-conversation@0.2.2-rc.1` 已有 InputBar、Lexical、提交状态机、附件、模型控件、停止和 Queue，但没有外部群路由的提交 transport，也没有独立可渲染的 composer factory。直接复制组件或劫持全局发送均不采用。

`scripts/native-composer-extension.mjs` 对固定 SHA 的上游 bundle 生成最小扩展：

1. 原 InputBar、原注入配置及原子 slot 声明只保留一份，提取为 `naumi.native.composer.bar` factory；原生 `conversation.composer.bar` 和群聊都调用它。没有第二份编辑器或发送按钮实现。
2. 新 `conversation.registerComposerTransport(sessionId, {submit,cancel})` 只对显式注册的 Session 生效，卸载时释放。未注册的私聊/线程完全保留原 sendSession/prompt、上传和停止路径。已安装扩展和原始源码均严格校验 SHA，拒绝未知漂移。
3. 群的 `naumi.group.composer` 是严格 Session wrapper，复用原生 conversationStore 和 bindDraftPersistence。prepare 只确保真实群 Session 存在，不触发模型；随后 refresh/retain，向原生 SessionProvider 传 **SessionReference**，不是字符串。切换释放 transport 和引用。
4. 原生编辑器处理输入法、引用、附件序列化和失败草稿；群适配仅提交群 HTTP，并在 SQLite 真正受理后确认成功。点名、任务选择、未确认提交 UUID 独立保存为少量场景元数据；文本草稿仍由原生存储负责，换群或私聊不串稿。
5. 附件沿用原生上传与准入：从 composer 所属 Session 解析 receipt，经 attachments.admitPromptContent 后持久化；不接受任意服务器路径。已上传图片优先用 receipt，避免在群 JSON 重传大图。成员模型不支持图片时不伪造成功回复。
6. 原生“停止生成”路由到当前群回复的精确消息。活动原生回合以 keepInbox=true 中止，等待精确 turn/end，不等待可能已经开始的新话题整体 idle；待处理条目只移除精确 inbox ID。独立 task 的 cancel 方法没有被调用。

扩展通过 sync/install 链路装配；桌面固定版本 staging 同样应用。原包文件原子替换以断开包管理器 hardlink，并保留原字节备份；不改 package 版本、供应商、密钥、权限或第三方模块 ID。

## 本次实现与迁移状态

群中连续消息、真实工作头像、即时账本反馈、结果与原文件入口、任务关联补充及原生 dock 已接通。线程模式与员工私聊保留。老群无需重新建群，老任务使用已有数据投影；不会自动重试历史中断任务。

## 验证命令、结果及证据层级

完整命令、失败记录、回滚和加载证据见 `evidence/group-live-collaboration/VERIFICATION.txt`。

- 基线定向 25/25。新增生产服务/临时 SQLite/确定性执行器覆盖受理、进度、群中新话题、同任务修订、CAS、幂等、跨群和同 Bot 跨 Session 隔离、停止、重开及附件元数据。
- 真实 Harness 壳 + 候选原生 InputBar/Lexical/提交状态机：18 项交互通过，0 page errors。群写入只到临时 SQLite，工作由确定性执行器驱动；真实 Session 仅只读 retain。验证发送、失败保稿/同 UUID 重试、刷新草稿、关联原任务、停止不取消工作、结果入群、私聊隔离与 420px 布局。不是供应商模型业务验收。Ego 截图两次超时，未取得图片，不声称已完成截图交付。
- 首轮全仓 530/535：四项为 worktree 缺 desktop/node_modules，补只读依赖 junction；一项是旧的主区字面守卫，改为本次精确声明并继续比较其他字节。原失败日志保留；后续集中回归另记。

## 未完成项与下一步

不把上述确定性联调写成真实供应商任务验收。真实用户自然语言是否在每一轮正确选择工具，仍取决于当前模型并需业务观察；系统受理和工作状态无需依赖模型说“收到”。安装包本次不重建。完整截图因浏览器截图 API 超时未交付。固定 main 的实际运行加载与只读验收在完成后追加，不以 Git 合并代替运行验收。

## 固定主线加载与收口

- 已整合远端账号/更新/0.3.4 发布主线至 e148c01，保留其 client 追加注册、发布脚本、版本和全部证据。集中回归 554/554，通过后普通合入并推送主线。
- 从固定 main 31d78709602b70b01629eec78d2ad6f3ec3bc716 实际增量加载 9 个插件文件及 1 个上游 composer 扩展文件。HTTP 200，群协作 contract=1，实际模块批次包含扩展；90 个无关运行文件及 87 个配置/原始 Session 文件哈希保持，模型、员工 export、任务与原四张群表行保持。
- 加载后 79 sessions / 0 running / 3 bots。服务继续运行，所有隔离浏览器和测试宿主已关闭；没有使用真实业务群发送测试任务或调用模型。安装包未重新构建。源码归档、副本回滚和加载证据均独立保存，副本回滚不降级真实账本。
