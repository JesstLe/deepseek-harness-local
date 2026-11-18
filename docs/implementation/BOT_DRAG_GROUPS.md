# Bot 拖拽排序与组合建群

模块与职责：在原侧栏Bot条目之上加入排序、多选拖动、合群与加入已有群。复用原GroupStore、Service、API和群聊原生输入器/独立成员Session，不建立第二个群/执行账本。

负责人及范围：本线程独立codex/bot-drag-groups-20261118；开工main/origin5f051a1a978b2a9616df17c8fee2e9e4503bc373。同文件范围bot-sidebar.js/css、bot-chat-model.js、bot-group-store/service、bot-groups.js及对应测试/QA/docs。并行service-align不覆盖；加载前另行窗口协调。

公共接口、依赖方向、数据/状态/事务归属：排序为本机localStorage视图偏好naumi.botOrder.v1，保存身份ID而非名称，不修改Bot目录/记忆/任务；原置顶保留默认优先，用户明确拖动排序解除单项置顶，主Bot默认首位但自定义顺序优先。群组仍用原bot-groups.sqlite；create复用现有幂等UUID接口和主Bot自动加入/默认接话策略。新增owner同源add-members，只增成员，不搬运或删除原私聊；SQLite原子操作/operationId回执保护并发、丢回执重试，旧成员Session和历史保持。原schema1不变，追加receipt侧表，旧源码读取兼容。

交互：条目顶部/底部24%是排序位置，中部是建群/加群；插入线与合群高亮明确区分。Ctrl/Cmd多选、Shift范围、Escape取消；批量拖动顺序保留当前列表相对顺序。Alt+上下提供键盘排序；多选工具条可直接建群。失败保留同一请求UUID供重试，不隐式重发另一新群；最多12位成员（含原策略的主Bot），自拖无操作，外部文件拖入忽略，不派单/调用模型。折叠头像仍是原组件和hit target，不改变模型位置/聊天草稿。

本次实现与迁移状态：排序/拖放UI和最小成员追加接口实现中。禁止真实任务/真实群做写验收；仅独立home隔离验证群创建/成员追加/并发/重试/重启。当前未加载共享服务、不发版。

验证命令、结果及证据层级：待完整模块集中测试、真实原生拖动/多选/刷新/加群以及副本回滚后补充。源码合并和运行加载分别留证。

未完成项与下一步：集中验收、主线普通整合推送、running=0窗口增量加载、归档重开；企业功能/现有身份/原任务执行链路不变。
