# 日常五项收口

负责人：当前任务；分支 codex/daily-five-closeout-20261117；基线 ba4ee2a182e3dd8d4a4ddc5160b193fc987af8cd。独立 worktree E:/Workspace/naumi-daily-five-20261117。

## 范围与状态
1. Bot 工作总览、自动任务标题、手动改名与历史检索：已主线、真实服务增量加载。
2. 旧 Bot 工作区与历史文件复制迁移：已主线、3个旧Bot实际迁移和9个历史文件复制通过；不删除原件、不改旧任务 cwd。
3. 文件不可变版本与同任务修订：已主线、真实服务加载；原生隔离二进制交付验收通过；复用原 Session 文件预览和任务卡。
4. 钉钉真实机器人私聊：用户明确延期到明天对接；不配置账号、不发送消息、不再收集凭据。
5. 固定 main 安装候选、升级/数据保留与公开发布：待前述切片完成后执行。

长期自主 Bot 愿景仍留在根目录待实现.md，本轮不实现。插件市场远端部署不混入第4项真实IM验收。

## 模块、接口和状态归属
BotDirectory / 原生 Session、BotTaskStore、原生标题事件和工作区服务继续持有身份/任务/标题/工作目录；IM inbox/outbox保持现状。总览只聚合已有任务与会话，不复制输入器。文件版本是原生交付的内容快照，不另建任务状态机。迁移先复制并校验，再创建各 Bot 自身 profile 的原生新home，最后目录 CAS发布；旧任务与预览继续指向原处。

## 文件归属
当前任务：bot-overview与标题公共辅助、bot-workspace-migration、bot-file-versions、新资产和必要 bots/bot-tasks/runtime/card/schema挂接；对应测试/脚本/打包与记录。保留其他工作树、主线未跟踪安装器证据，不改已有主动执行分支。

## 验证与证据层级
完整模块后集中验证；明确源码、隔离真实原生HTTP/UI、实际配置迁移、真实账号、安装与远端发布。真实IM按用户决定保持待验收。四件套及基线/修改/副本恢复另存 evidence/daily-five。业务迭代计数当前0。

## 未完成与下一步
按1→2→3→5推进；第4项延期而非完成。首个切片先让点击Bot进入真实工作总览，打开任务仍用原生线程，聊天与新任务为明确操作。

## 切片实现进度（未宣称实际加载）
- 工作总览：点击Bot进入聚合页，聊天/新任务明确分离；复用现有TaskCard/原生会话、手动改名API、共享目录和任务SSE；自动标题为无模型调用的首条内容抽取，原生user标题不覆盖。
- 迁移：原只读规划器抽成公共模块；新增owner维护接口与持久意图、原件保留复制/哈希校验、各Bot自身profile的新home、目录CAS；碰撞、源变化、忙碌、保存失败和同意图恢复已覆盖。
- 文件：通过原生workspaceFiles读二进制，生成工作区内按原事件坐标寻址的只写一次快照；新attempt保留deliveryHistory；旧引用不伪造快照。原生预览继续使用，任务版本打开前校验哈希；跨Bot文件只传递已核验快照，复制到接收方工作区，不放宽工具权限。
- 首轮切片47/47通过。旧测试中“删除工作原件导致交付失效”和“跨工作区永远拒绝镜像”改为本次明确要求的快照保存和验证后复制；伪造原事件、路径越界仍拒绝。新二进制测试首次缺原生surfaceOp的夹具错误已修正，未弱化原生schema。
- 协作：D4线程已释放cf56ad3加载窗口，101sessions/0running；本任务未操作3080，后续加载前重新协调；不修改employee-work*与employee-center*归属。

## 2026-11-18 接续记录
- 最新已获取 origin/main=5201ec4；原隔离基线 ba4ee2a，尚未合入本切片。
- 协作边界再次确认：不写 employee-work*、employee-center*、employee-store.js；自然目标线程独占 goalProposals 导出追加。本线程不实现自主规则。
- 完整三个功能模块切片已实现，迭代计数3，准备提交后整合最新主线并集中全量验证。
- SLICE_FINAL.log：49/49，exit0。覆盖复制/碰撞/忙碌/CAS/持久失败恢复、二进制快照/同任务新版本/删除工作原件后重开/跨工作区交接/篡改与权限拒绝。
- 原生UI改名的远端客户端参数必须为原始请求对象，不能套HTTP RPC的request外壳；已修复。原生工作区控制器的公开列表为workspaces.list.getSnapshot()，已改用。完整UI验收继续执行。
- 单文件快照上限64MiB，单次最多8个交付，attempt最多100。快照失败明确为unavailable；不把旧无快照文件标成不可变。直接会话历史仍用原预览，任务版本页使用新快照。

- 完成主线同步：9437eb4 + 最新c8b02bb -> eac450d；保留Blender/Cloud47/D4/D3，未写自然目标五文件。
- UI_FINAL.log：真实原生Harness与确定性本机SSE，12/12；改名持久化、1360/580/360宽度、原生编辑器、切换草稿保持、明确新建仅1 Session、0页面异常。截图已打开检查。
- 首次并行全仓733项729通过：两项受客户端工作副本CRLF和新面板白名单期望影响，统一原字节LF并更新精确白名单还原断言；另两项为Windows夹具清理/短超时，在集中串行复测58/58中通过。原失败记录保留。
- 准备0.3.6候选：仅desktop版本、锁文件根版本、product-version和用户更新日志；后续固定main构建。钉钉延期继续有效。

- FULL_FINAL.log：`node --test --test-concurrency=1 tests/*.test.mjs desktop/tests/*.test.cjs`，733/733，exit0，154.4秒。
- 再同步def82a3，合并点f89029b；新增上游变化仅自然目标证据与Cloud部署脚本。LATEST_MAIN_RECHECK.log集中56/56，exit0。D3/D4文件与工具/确认接口全部保留。
- 加载协调：D3已释放，PID7416/101sessions/0running；D2使用独立profile/随机端口，不占3080。本任务即将main整合，再做只读prepare，运行时仍未加载。

## 真实加载与迁移（2026-11-18）
- 20文件增量prepare基线32159bd，host/client按现有运行版本精确追加挂接，package仅追加5个模块名；不覆盖整包、不碰employee-work/center/store。初次验证完成后证据目录缺失，已修复证据保存可重入；复查成功，不重复加载。
- 加载后101sessions/0running，126无关运行文件和109权威文件保持，员工导出、模型、群账本、任务不变。
- 真实迁移先暴露启动时registry尚未提供；请求在复制/新home/目录变更前拒绝。改为操作时延迟读取，新增原生隔离迁移测试，再单文件补载b65d506；没有模型请求。
- 迁移operationId=2f264e20-029a-4e6f-8bcf-c9b8c67eec91：3个旧Bot迁移，9份副本SHA通过，旧原件保留；4个Bot现在独立cwd，104sessions（101旧+3新home），catalog revision47，0running。旧任务/群/模型/员工export不变；44未归属条目、3待核查引用不猜归属、不删改。
- MIGRATION_ROLLBACK.json：真实目录原字节备份SHA匹配迁移前捕获值，在另一副本恢复并用BotDirectory重开；当前实际目录保持迁移后状态，101旧Session压缩文件原字节保持。
- UI_NATIVE_BINARY.log：18/18，原生present发布实际二进制，经真正workspaceFiles分块读取生成快照；删除工作原件后快照逐字节和owner核验通过。供应商外呼0，4次确定性loopback夹具请求。
- 源码副本ROLLBACK tests=43 pass=43 fail=0 exit=0；当前修改保留。可执行ROLLBACK.sh仅接受带任务marker的runtime副本，不操作实际数据目录。
- 0.3.6中间依赖stage从固定main b65d506完成：45,618文件、closure PASS、private paths0。用户要求纳入D2 82d2070后，不发布中间包；仅刷新两份D2源及打包副本，重新核对其余45,614 staged文件，再从包含D2/D3/D4的固定main打最终安装候选。没有重跑真实模型。

- D2最终计数沿用主线程补正：13检查、10原生会话回合、2次宿主启动；22为本地隔离连接入口计数，不是精确上游收费调用数，原生持久事件18条已提交模型响应。本文不重跑真实模型。
- D2加载后本线程只读复核104sessions/0running/4bots/catalog revision47，4个独立cwd和3个新home保持。D2通知中revision46为旧口径，已按实时47说明。
- 最终依赖stage核验完成：source dbaaee9，package invocation5ffd5f7，两者plugins/desktop无差异；D2四份文件刷新、其余45614文件哈希通过，45618总文件，closure PASS。后续主线程证据提交不改变本次打包产品代码。

## 文件归属交接（2026-11-18）
- bot-task-service.js / bot-task-store.js / bot-tasks.js 本轮修改已收口，主线程接续目标—派单—交付的可选已确认Goal引用；本线程不再追加这些文件。
- 交接保留fileReference.snapshot、deliveryHistory，以及continue/retry/direct continuation中的archiveDelivery调用；继续复用现有任务/交付和原生会话。
- 本轮0.3.6是当前候选，不代表完整自然Goal愿景完成；任务目标关联、Codex/Claude导入及整体目标验收仍由后续切片处理。钉钉真实私聊延期不变。

## 安装升级验收发现与修复
- 首轮真实/currentuser：0.3.5安装exit0，0.3.6手动覆盖安装exit0，但旧卸载器未收到--keep-shortcuts，删除原有桌面Naumi.lnk；保护检查失败，INSTALLATION_FIRST.log / INSTALL_PENDING_FIRST.json保留，未发布草稿。
- 原入口已按Cloud47既有目标与原Icon恢复，SHORTCUT_RESTORED.json明确exact=false：功能与目标恢复，重建后的二进制hash不等同验收前；不记成“原字节保持”。Program Files原安装与HKLM保留。后续验收先保存恢复后快捷方式原字节。
- 根因是stock setIsTryToKeepShortcuts在allowToChangeInstallationDirectory时将所有手动安装置false，哪怕原目录已有支持保留链接的Naumi.exe。新增upgrade-shortcuts.nsh只调整该能力选择：原目录手动升级采用已有支持--keep-shortcuts的路径；新安装/更换目录仍保留stock行为，原生自动更新不变。
- 原engine仍保留stock提取、旧卸载器、签名、大小检查、维护锁与注册，只追加精确校验的shortcut policy include；原始/修改engine hash重新生成。NSIS真实宏5例通过：baseline manual=false，modified manual=true，fresh=false，auto=true，changed-directory=false；没有注册表/用户快捷方式写入。
- 安装器模块11/11通过。最终复测从已安装旧策略0.3.6覆盖到修订版0.3.6，保留最初0.3.5安装及退出回执；不把这次补测写成第二次干净的0.3.5起点。当前候选仍未公开。

- 首个policy候选真实重试观察到旧卸载器参数仍缺少--keep-shortcuts，未认定修复：installUtil.nsh中的函数在include时已展开原宏，随后重定义只影响外层Section。已改为从固定upstream生成仅替换该宏的install-util.nsh，让原函数定义前就采用修订宏；构建校验原始/修改util双hash，原生fixture也从实际生成util取宏并先编译函数再调用。新增编译时序回归，模块12/12及原生5例通过；首个policy上传仍为草稿，后续替换。

- 最终候选固定main58ccccd（runtime stage dbaaee9，包含D2/本轮总览迁移文件版本与D4；不含后来e7fe7a5目标关联或creation/import后续切片）。该候选worktree最终集中全仓739/739，exit0，152.98秒，FULL_CANDIDATE_FINAL.log；没有真实模型请求。
- 最终修订包495184762字节，SHA256 f37018df64eee312193b7109e3f9da35d1f306c3dea3e44745b3e07cd7b00d2e；草稿资产已替换，最终原生旧卸载器命令行确含--keep-shortcuts（UPGRADE_NATIVE_ARGS.json），覆盖安装完整验证尚在执行。共享3080不参与安装验收。

## 最终交付状态（2026-11-18）
- 本轮1工作总览、2旧Bot工作区迁移、3文件版本：已main/真实3080增量加载与验收；5安装公开发布已完成构建与真实覆盖升级/卸载验收；4钉钉私聊仍按用户要求延期。
- 修订版0.3.6覆盖升级exit0，45618安装文件哈希通过；真实打包主进程与内置后端登录/检查更新/DingTalk只读未登录状态/worker退出通过，模型0。fixture二进制/persona/memory保留；卸载exit0；HKLM、Program Files原安装及恢复后快捷方式逐字节保持，目录与注册表恢复。
- 最终复验起点为已安装旧策略0.3.6，保留最初0.3.5安装与前两轮失败回执；不冒称又执行了一次干净0.3.5→修订版升级。第一次用户快捷方式重建hash不同的事实继续保留，最终不写“全程原字节保持”。
- GitHub v0.3.6已公开Latest，tag目标58ccccd29f1454ac6286b37e27d1610bd4f50d37；资产495184762字节，SHA256 f37018df64eee312193b7109e3f9da35d1f306c3dea3e44745b3e07cd7b00d2e，latest.yml同步。后续D3/creation/session-import不混入此候选。
- 源码四件套与完整基线/修改/源码副本恢复/真实目录副本恢复/安装发布下载证据位于evidence/daily-five；副本回滚保留当前修改。最终以VERIFICATION.txt、PUBLISH.json、DOWNLOAD.json和REOPEN记录为准。
