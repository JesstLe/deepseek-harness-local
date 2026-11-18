# 群文件、输出预算与入群反馈修复

## 模块与职责
负责人：本任务；隔离分支 `codex/group-files-model-output-20261118`；基线 `ab34d8343d5bc417e7b54d1a626943e2e84cbf0f`。
文件范围：bot-groups、bot-sidebar/model、model-connections UI、model-specs；新增 pinned native-delivery 扩展及 sync/prepare-runtime 接线、对应测试和验收脚本。保留共享工作区未提交内容。

## 公共接口、依赖方向、状态归属
- 群原先自写文件按钮，且 sidebar-right 在 activePanelId 非空时卸载 surface，openResource 抛 no session surface。缺口是原生没有显式自定义面板 Session 接口和可复用文件卡 factory。
- `sidebarRight.registerPanelSession(panelId, sessionId)` 返回幂等 disposer；只有注册面板可启用原生右栏。原生 SidebarSessionViews 继续持有引用、持久化 tab/store、焦点、资源预览和销毁。群使用 prepare 返回的发送 Session，不改普通线程选中状态。
- `naumi.native.deliverables` Session factory 与普通 turnTail 共用一个 nativeDeliverablesSpec、同一个 Deliverables/PresentedFileCard、opener/host/menu/actions。群按文件源 Session retain/ready/SessionProvider/release；不以群发送者代替文件实际来源。
- 工具源 seq/index 保持；snapshot 预览先经 taskId+source Session+seq/index 版本校验，校验失败显示错误，不打开当前工作文件代替历史快照。卸载后异步预览不落入下一个群。
- 原生 bundle 按 SHA256 严格匹配、原子生成，保留原件；未知上游或扩展漂移即停止。开发验收只代理候选文件，不写共享 node_modules。

## 本次实现与迁移状态
1. 群回复及任务抽屉移除仿制文件按钮，走原生卡片与资源预览。
2. 原表单官方值保留旧 maxTokens；未知官方输出上限被旧预算当硬上限；每次按键还会缩小 contextWindow。现区分三者：单模型显式官方值采用已公布输出最大值；未公布不猜数且允许合法自定义输出；输入不联动写另一字段，保存时校验组合。全局校准继续保留现有输出预算，不意外提高调用预算。
3. 成功提示 3000ms 消失，重复成功重新计时；拖拽说明与错误不被计时误清除，卸载取消定时器。

## 验证命令、结果及证据层级
基线：`node --test tests/naumi-bot-groups.test.mjs tests/naumi-group-collaboration.test.mjs tests/naumi-model-specs.test.mjs tests/naumi-bot-sidebar.test.mjs`，37 pass / 0 fail / exit 0。证据 `evidence/group-files-output/BASELINE.log`。
集中验证结果在模块完成后补录。

## 未完成项与下一步
完成集中回归、隔离真实 Harness/HTTP/native 预览/参数保存/反馈消失验证，再刷新主线、普通 merge/push。源码、main、实际安装运行版本分别记录，不以局部测试冒充上线。
功能迭代计数：本切片 1（含三个修复点）。
