# Bot 拖拽排序与组合建群

模块与职责：在原侧栏Bot条目之上加入排序、多选拖动、合群与加入已有群。复用原GroupStore、Service、API和群聊原生输入器/独立成员Session，不建立第二个群/执行账本。

负责人及范围：本线程独立codex/bot-drag-groups-20261118；开工main/origin5f051a1a978b2a9616df17c8fee2e9e4503bc373。同文件范围bot-sidebar.js/css、bot-chat-model.js、bot-group-store/service、bot-groups.js及对应测试/QA/docs。并行service-align不覆盖；加载前另行窗口协调。

公共接口、依赖方向、数据/状态/事务归属：排序为本机localStorage视图偏好naumi.botOrder.v1，保存身份ID而非名称，不修改Bot目录/记忆/任务；原置顶保留默认优先，用户明确拖动排序解除单项置顶，主Bot默认首位但自定义顺序优先。群组仍用原bot-groups.sqlite；create复用现有幂等UUID接口和主Bot自动加入/默认接话策略。新增owner同源add-members，只增成员，不搬运或删除原私聊；SQLite原子操作/operationId回执保护并发、丢回执重试，旧成员Session和历史保持。原schema1不变，追加receipt侧表，旧源码读取兼容。

交互：条目顶部/底部24%是排序位置，中部是建群/加群；插入线与合群高亮明确区分。Ctrl/Cmd多选、Shift范围、Escape取消；批量拖动顺序保留当前列表相对顺序。Alt+上下提供键盘排序；多选工具条可直接建群。失败保留同一请求UUID供重试，不隐式重发另一新群；最多12位成员（含原策略的主Bot），自拖无操作，外部文件拖入忽略，不派单/调用模型。折叠头像仍是原组件和hit target，不改变模型位置/聊天草稿。

本次实现与迁移状态：排序/多选拖放UI和最小成员追加接口完成。群创建追加payload收据，使丢创建回执后群已改名/扩员仍返回当前群，不重建或回写旧状态；复用原room UUID，冲突payload仍拒绝。新增群成员只创建原members里的稳定Session ID，不启动Agent或模型；原生群输入器后续按原prepare/执行链使用。请求未知时保存在当前tab的pending操作收据，刷新后只由用户显式“重试保存”重用原UUID；未成功前不接受另一个群写入。私聊入口和草稿完整保留。

验证命令、结果及证据层级：24项定向HTTP/SQLite/客户端模型通过；原生隔离Harness+Chrome真实mouse拖动17项PASS，覆盖边缘排序刷新保持、Alt上下、中心建群、私聊草稿、多选合群、加成员、真实commit后丢响应/刷新再同UUID重试、原群Session保持、Shift选区/Escape、折叠hit target、0任务派单/0模型。首次全仓857/857通过；最后补创建回执在后续改名/扩员后的重试用例后再集中终验，最终计数见REGRESSION_FINAL.log。真实业务群/员工未参与写测试；全部隔离home。

实测修复：原native拖放期间短状态文案在流内显隐会移动行位置，中心投放可能落成边缘；改为不占布局的状态浮层，拖动开始不改变现有多选工具条高度。原生子元素切换产生dragleave不得清掉最终drop，最终区域以松手坐标重新计算。修正后的17项真实拖动通过；原失败日志保留。首轮SQLite reopen断言原型差异只修QA序列化，不改生产记录。

主线同步：已整合e6cdab4服务对齐功能；后续5d5bd81只为该任务最终证据，将在最终合并前刷新。当前部署脚本只把六文件复制到现有代码候选，再复用service-alignment原子hash/CAS helper，保留其他文件原字节（包括EOL）和服务0.3.9版本，不重新做全目录对齐。工作区/身份/模型/企业权限不变，原生maintenance running=0后才短停加载。

未完成项与下一步：终验/副本回滚、主线普通整合推送、running=0窗口六文件增量加载、归档重开；本任务不安装客户端、不发模型、不重放任务、不重发既有安装包。真实加载及数据保持以DEPLOYMENT.json为准。

最终集中验收：原整合版本终验858/858通过（REGRESSION_FINAL.log），包含新增创建回执用例；随后整合dae76e3的员工设置功能，不触碰其文件。新上游5项设置测试使用共享补丁后依赖但无原备份时有2项原件假设断言失败；只在独立副本逆变换并核对固定上游91f464...原hash后5/5通过（UPSTREAM_SETTINGS_COPY.log），共享依赖/测试不改，失败留证；不将这两份测试口径混成一次863全仓绿。运行模型/真实群写入均为0。

最终加载：功能普通合入推送main68572483027d450b18c9170aff707b3cf9a43122；六文件RUNTIME_PLAN/backup哈希固定并CAS增量成功，PID25144/HTTP200。107sessions/0running/4bots/revision47、Session IDs/Bot/群/任务/员工export前后一致；164无关代码文件、6配置原字节保持，service0.3.9、设置/身份/更新/native/host/client不改。回执source字段在完成时读取HEAD为fd5d4555646191f921f45d4933c15d6b7b34c4a1，这期间其他线程仅修改deploy-employee-settings.mjs一个脚本，六个产品文件完全无差异；开始SHA与结束SHA分别记录，不冒称又加载其他模块。原始receipt保留，另加DEPLOYMENT_AUDIT解释。没有真实群写入、模型或任务重放；新增空receipt侧表而非业务数据迁移。3080窗口已工具正式释放。

副本恢复：portable ZIP19条目（11源码、7原件、manifest1）解压另一标记副本执行ROLLBACK，恢复7文件/移除4新增；原24测试通过；已写新receipt侧表的schema1群DB由恢复的旧源码重开，3位成员与Session保持。无标记或副本已改会在写入前拒绝，实际源/运行修改仍保留。
