# D1–D5 最终交付核验（2026-11-18）

## 范围与权威

本次核验对应当前Goal及DAILY_EMPLOYEE_PRIORITY.md的D1–D5，不将旧M3/M4企业待办改写为完成。企业组织、设备登记、统一APIKey下发、企业共享记忆/同步、集中授权预算、跨设备分布式扩展保持原状。统一登录既有策略保留；无新离线授权。本文件是需求→证据对照，系统Goal以工具返回为准，最终Git/归档/重开由evidence/daily-release-037/FINAL_REOPEN.json封口。

## 逐项证据

| 要求 | 当前权威证据 | 核验结论/层级 |
| --- | --- | --- |
| D1 普通入口，非企业账号创建/编辑目标、版本/退回/逐项验收/关闭 | evidence/daily-work/UI_VERIFICATION.json PASS18；work-goal-task-links/UI_VERIFICATION.json PASS15；work-file-acceptance/UI_VERIFICATION.json PASS14/2boots | 原生壳/真实HTTP/SQLite操作，不依赖企业角色；新包完整plugins源hash与已验证源码一致 |
| D1 复用原输入器、草稿/IME/附件/停止/模型位置、原图标/导航 | 原生UI与810全仓；源未新增第二输入器/执行器；现有SVG路径/Icon字节保持检查；版本候选只改版本/日志 | 源码/单元/原生壳；本期2后端文件交付收敛不改UI/权限/模型 |
| D2 同一员工/工作区/历史，跨会话/模型/重启、人物设定/记忆/遗忘/临时要求隔离 | employee-continuity/LIVE_VERIFICATION.json PASS13/10turns/2boots、LIVE_NATIVE_EVENTS；daily-five迁移/9文件hash及目录副本恢复；daily-real-acceptance真实经验检索 | 真实模型与原生持久事件；22是入口观察、18是该D2持久响应，不称收费请求数 |
| D3 自然目标提议、owner确认后派单，不把模型结束当验收 | daily-real-acceptance/live-1794941925162/LIVE_VERIFICATION.json PASS21/3boots；来源/owner/委派原任务记录 | 隔离真实供应商；人工动作由owner API明确测试，不代替真实用户业务验收 |
| D3 同task/Session补充与退回、固定版本/来源/字节/人工验收/经验复用 | work-goal-task-links、work-file-acceptance原生UI/HTTP/二进制故障证据；daily-real-acceptance/OWN_BUSINESS_AUDIT、生成文件与SESSION_AUDIT | 两版CSV25/2760→31/3480，旧文件保留；接受绑定attempt/message/session/goal criteria与文件集合hash |
| D3 文件任务单一交付，不再生成重复文本草稿；历史不删改 | file-delivery-single-path/LIVE.log与BUSINESS_AUDIT；9真实检查、49模块、810全仓、43源码恢复 | 同任务attempt2、2文件版本、1份files交付、0text artifact；旧create/revise/submit回执、文本任务和独立主动草稿兼容 |
| D4 无企业登记可明确批准本地规则；无事0模型、工作窗/上限/人工优先/停止 | local-proactive/UI_VERIFICATION PASS16、VERIFICATION及源码；daily-real-acceptance真实默认停用/一次批准/不自审/不重复 | 共用原调度/消费者/AgentLoop，不另建受管账本，不启用真实规则 |
| D4 断流/强杀/UNKNOWN不自动重放，owner核对、重启保持 | local-proactive隔离SIGKILL/事务/幂等故障测试；daily-real-acceptance真实上游截断→unknown→owner stopped→重启 | 真实断流无自动重放；入口/持久响应/供应商计费三者区分，权威收费数不冒报 |
| 导入 Codex/Claude，预览/幂等/原生继续/历史工具不重放 | session-import UI PASS17/2boots、真实来源只读hash、安装carrier副本UI17、7文件加载；0.3.7 stage含session-import模块 | 未自动导入或复制真实私有历史；最终source inventory与发布包一致 |
| D5 固定main最新完整构建、Logo/CLI/浏览器/无私人密钥 | BUILD_SOURCE3897fba；BUILD.log、BUILD_ARTIFACT.json；45650文件closure PASS/privatePaths0；unpacked/installed PACKAGE | 实际打包主进程/内置Node后端；钉钉1.0.68 readonly未登录；AgentDesktop随固定依赖1.3.1；Logo/检查更新位置通过 |
| D5 内置浏览器原生输入/滚动/布局及重启恢复 | browser/BROWSER.json PASS，真实webview own loopback页面输入Naumi、native wheel、1100/1440两窗口；恢复页面动作 | 非截图代理；native guest输入/滚动通过。不是性能容量基准，不声称新浏览器替用户导入历史 |
| D5 安装/升级/卸载与数据保持 | INSTALLATION.json：public0.3.6→0.3.7→卸载3个exit0；baseline/upgraded-smoke PACKAGE，同issuer/账号/home/native Session，persona/memory/binary保持 | 当前设备新隔离profile/目录的真实/currentuser NSIS；HKLM/ProgramFiles/本轮原快捷方式hash保持；未覆盖真实用户安装 |
| D5 认证服务器故障体验 | outage/OUTAGE.json PASS；真实打包应用活跃时本地RPC仍可用；冷启动IDENTITY_UNAVAILABLE且无worker/无新离线grant，数据字节不变 | 统一登录冷启动仍需服务器，这是本期保留的身份边界，不宣称服务器离线授权已实现 |
| D5 新版发布、匿名下载及旧版获取 | PUBLISH/LATEST_RELEASE/TAG、DOWNLOAD.json、real-update/REAL_UPDATE.json | v0.3.7公开Latest/tag3897fba；HTTP200/495305085字节，SHA256/SHA512匹配；真实0.3.6默认更新源下载/校验到ready，通知选稍后，未自动应用安装 |
| 原数据/模型/企业冻结与Git | daily-real-acceptance、file-delivery-single-path DEPLOYMENT；113权威文件、151无关运行文件、44其他线程证据，模型/员工export/任务/群行保持；最终main普通merge/push与清理见FINAL_REOPEN | 真实3080无模型测试/无业务重放；只隔离home做写验收；企业无登记/上传/启用 |
| 原件hash/副本修改/差异/可执行rollback/恢复行为 | 各模块四件套；release037源版本0.3.6→0.3.7、原42回归及副本恢复；最终ZIP含rollback metadata/original，独立解压交付包恢复另测 | 源码副本回滚不等于任意业务schema或已安装版降级；本期无schema迁移，不伪造降级认证 |

## 发布实体

- 固定产品源/tag：3897fba9971f3e08aee6c793419e803e41216bcf，最终main之后仅QA/文档/证据，不改发布产品输入。
- 安装包：Naumi-Setup-0.3.7-x64.exe，495305085字节，SHA256 1a0c96e99b35f31f722bf3c6450bfe4fa7ba8cbdff8acfe3505323d8a8b83e43。
- https://github.com/JesstLe/naumi-desktop/releases/tag/v0.3.7
- https://github.com/JesstLe/naumi-desktop/releases/download/v0.3.7/Naumi-Setup-0.3.7-x64.exe

## 如实保留的证据边界

安装/升级为本机全新隔离profile与目录，不声称第二台物理机/干净VM、企业终端批量认证或生产账号实际密码登录。账户API使用受控相同issuer/账号；更新API则是真实未修改默认源。真实模型任务另用独立home/随机端口及既有选中连接完成。旧0.3.6实际下载首轮已到ready，收尾报告变量错误导致exit1；修复复测复用同一经校验缓存，保留首轮真实进度，不称二次全量下载。浏览器前两次QA分别是wheel符号及已恢复tab定位错误，已按原tools wheel取负与恢复按钮契约修正，不修改产品。断网QA首轮错误地把undefined未初始化backend判为null失败，已增加probe存在、backend/settings未加载及旧worker receipt/数据不变检查。

企业组织/私有授权/设备/共享同步与钉钉真实私聊仍按先前决定后置；不把当前日常版本完成写成整个企业矩阵完成。初始化只处理新Naumi自有工作区，不隐式修改既有外部目录ACL。首次使用保留既有统一登录和自定义URL/APIKey配置，不将私人密钥塞入安装包。
