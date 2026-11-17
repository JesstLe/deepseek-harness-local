# 群聊流式 Markdown 重复节点修复

## 模块与职责

负责人：当前任务 agent。独占范围：`assets/bot-chat-markdown.js`，对应定向/浏览器回归与本记录。共享 checkout、安装器任务未提交产物保留。分支 `codex/group-stream-repeat-fix-20261117`，工作树 `E:/Workspace/naumi-group-stream-fix`。开工 main/origin/main 同为 `9f99b1d86d52c651f414007e75f3156b384a0346`，功能切片计数1。

## 调研与公共接口、状态归属

用户截图中重复的是同一段多行 Markdown 的粗体标题。只读核对对应群 SQLite 与原始 Session：最终模型正文1033字符，相关标题只出现一次；不修改用户记录。

先检查原生 Session 的 assistant-stream 结算/重连语义，以及群 `groupReplyView` 和 `watchGroupReplies`。实际复现将原因进一步收窄为既有公共群 Markdown 渲染器的 React reconciliation，不是已确认的流式传输重复：段落把每行 inline() 的元素数组 flatMap 到同一父节点，而每行 key 从0重置，跨行粗体/链接/代码节点 key 冲突。原生组件没有导出可直接替换的 standalone Markdown 工厂；本轮直接修正已复用的群 Markdown 组件，不引入第二套渲染器，不改原生组件私有状态或全局传输。

## 本次实现与迁移状态

每行使用稳定 keyed React.Fragment 隔离该行 inline key，并保留原换行。Fragment 不生成额外DOM包装。原始文本、Markdown语义、安全链接规则、文件引用、群消息排序、模型/权限、输入区、停止/排队、Session订阅及数据库均保持。

真实React生产模式的逐字浏览器回归：原版89帧中第29帧开始与全新渲染不一致，同一标题最终出现9次；修复后89帧全部与全新渲染一致，标题仅1次。此结果纠正此前“可能流式增量累计”的初步推测；不以文本去重、截断、强制remount或刷新掩盖问题。

## 验证命令、结果及证据层级

- `node scripts/verify-group-markdown-repeat.mjs BASELINE`：原版确定性复现；MODIFIED：逐字回归通过，0浏览器错误。真实React/Chromium，人工构造同结构文本，不调用供应商。
- `node --test tests/naumi-group-markdown.test.mjs tests/naumi-unified-chat.test.mjs tests/naumi-group-collaboration.test.mjs`：22项通过，覆盖逐字partial Markdown、inline key边界、无额外DOM包装与危险链接/HTML保持惰性，以及原有群状态、订阅与文件引用。
- 全仓、副本回滚、固定main运行加载与HTTP结果见 `evidence/group-render-repeat/VERIFICATION.txt`。

## 未完成项与下一步

不重写、不重发已完成回复。只增量加载该前端模块，刷新页面后重建已有DOM；不重启服务，不改用户群记录。安装EXE未重建。原版回滚仅在另一副本验证，保留原SHA与缺陷复现结果。
