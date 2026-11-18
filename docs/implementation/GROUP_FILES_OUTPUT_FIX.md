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
集中回归第一轮：44 tests / 44 pass / 0 fail / exit 0。
隔离真实 Harness + Chrome 验收：`node scripts/verify-group-files-output-ui.mjs`，`FIX_UI_COMPLETE checks=19 errors=0 inference=0`，exit 0。实际原 native present executor 创建持久化 deliverables/presented；真实 source Session 文件读与原生 Markdown/HTML 右栏；普通线程与群卡片相同 CSS/class/component；群抽屉、切群/草稿恢复、入群反馈过期；模型输入128000不改上下文，384000/128000/未知官方输出/私有别名预算经 owner CAS 与实际 YAML 保存、重开保持；超官方值明确无效而非静默缩小。
群消息 read projection 使用验收 fixture 引用上述真实 native 回执，不把 fixture 写成真实供应商或线上业务完成。浏览器无 pageerror、无推理；fixture 未接通企业账号/OS opener 的401/500资源回执保留在 UI 日志，不声称这些外围服务就绪。
首次预览联调发现原生 child slot 不能重复声明；现只在共享 factory 中声明一次 children，普通 DeliverablesTail 转交该 factory，不复制/重复注册 actions。fixture 初版缺 assistant/message.stream，已按上游事件类型补齐 stream:[] 与 step/end；该修正只在隔离测试生成器，不修改产品 Session 数据。

## 主线同步
首任务提交9ebf77e；刷新并普通 merge origin/main 1bee995，整合提交7fd3fc1。CSS 冲突保留双方：群工作指示器以及原生卡片宿主宽度，未删他人工作。初始基线与整合前主线分别记录；回滚基准采用1bee995，保留已合入的新工作指示器。

## 未完成项与下一步
已完成19项UI/HTTP验证；整合后集中回归、main merge/push、窄范围runtime接线与副本回滚证据继续记录。源码、main、实际安装运行版本分别记录，不以局部测试冒充上线。
功能迭代计数：本切片 1（含三个修复点）。

## 集中验收与回滚
- 整合后集中验证104项：104 pass / 0 fail / exit 0；覆盖群CRUD/路由/恢复、原生transport、主线工作指示器、改名、模型连接/推理、原生文件交付单路径、文件snapshot权限及提示计时。
- 初次扩围回归出现两个源码契约测试失配：一个是Git checkout行尾差异；另一个是新增显式sidebar lease导致原composer effect字节不再相等。现统一换行后比对；仅剥离本任务三处lease接线后仍逐字核对既有transport。bot-chat只更新对照为已经合入的1bee995，继续保护当前群路由与新工作指示器。不是通过删业务断言跳过回归。
- `node scripts/package-group-files-output.mjs`：18文件修复包/patch重开，标记副本rollback恢复12文件并删除6新增文件，原37项回归全部通过，活动源码保持修改态；patch在还原副本上check通过。
- 四项产物位于 `evidence/group-files-output/{MODIFIED_FILE.zip,DIFF_FILE.patch,VERIFICATION.txt,ROLLBACK.sh}`；manifest保存原始及修改SHA256。ROLLBACK.sh仅接受标记副本并校验全部哈希后操作，不直接改活动工作区。
- 桌面运行探针确认当前C:/Program Files/Naumi/Naumi.exe以external模式连接127.0.0.1:3080；不把独立打包fixture的58062端口混成用户实例。runtime载入前读取110个Session与任务账本，running=0、activeTasks=0；只接线本切片6个plugin文件+2个原生bundle，保留配置与预算。
