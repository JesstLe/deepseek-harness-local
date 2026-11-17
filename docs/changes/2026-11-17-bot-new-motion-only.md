# 删除旧版工作旋转框，仅保留新版 Bot 动画

模块与职责：Bot 工作状态视觉。负责人为当前任务 agent，文件范围仅 bot-task.css、异步 UI 验证脚本与对应断言、本文及 evidence/bot-new-motion。

公共接口、依赖方向、状态归属：不改引擎、不改任务/会话/权限/目录。已有 Grok Ball 32 个表情保持；running 仍通过 appearanceEmotion 映射到32。它们是参考引擎的32个表情，不是新增32种业务动作；只按真实状态映射，不随机轮播所有表情。

本次实现与迁移状态：删除 bot-task.css 中 running 头像的旧 ::after 旋转框、nbt-working keyframes、该框专用的 reduced-motion 规则和无用定位规则，共4行；不使用覆盖/隐藏补丁。修正旧 UI 测试对旧框的成功断言，改验 SVG data-emotion=32、旧框 content=none、SVG动画实际变化与 reduced-motion 后 SVG稳定。

验证命令、结果及证据层级：初始相关8项通过；修改后异步Bot+头像模块16项通过；真实运行Harness+受控只读任务/SSE，20项浏览器检查通过，包括工作32/返回待机、新SVG确实推进、旧框无生成、模型/草稿保持、单SSE、减少动态、三种宽度。原始截图对应的旧框由基线检查复现。完整全仓和副本回滚见VERIFICATION。

未完成项与下一步：本轮只清除旧工作框并验证新版播放。若未来要让32种表情分别对应“思考/检索/输出”等更细推理阶段，需要各阶段权威事件，不能从task.running猜测。本轮不增加模型调用或伪造这些状态。安装EXE未重建。

Git基线：68b4bb462fd2d3df04524f4097b723b60933bb5c；隔离分支codex/bot-new-motion-only-20261117，工作树E:/Workspace/naumi-bot-new-motion。功能切片计数1。完成后普通merge与推送，CSS增量加载后经HTTP核验；不重启运行服务。
