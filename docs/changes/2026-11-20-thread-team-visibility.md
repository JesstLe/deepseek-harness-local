# 普通线程隐藏智能体团队

模块与职责：基线fc2d183dd49527ce264e55da8babcce43f26d128，codex/thread-team-visibility-20261120，仅team-panel.js显示适配、对应测试/证据。用户要求普通线程右侧不显示团队；不改模型/消息/任务/浏览器/导航位置。

公共接口、依赖与状态归属：复用bot-sidebar-model.threadOwnership及已有botCatalog/taskActivity/groupCatalog/native useSessions，按精确Session归属判断，不以标题、workspace名字、单成员agentTeam投影或左侧当前模式猜测。只在展示层包裹原ContextPanel和原agent-team入口；普通线程不挂载团队observer/布局占位。Bot主聊天/worker/群成员/原生后代保留原团队功能。

实现：同一scope hook用于侧栏整体和native团队入口，避免只隐藏右栏但原按钮回漏。其余原生Portal保留无dock回退行为，原InputBar、preset/usage/activity、文件/浏览器/sidebarRight注册和生命周期不拦截；Bot离开时原ContextPanel清理reserve/observer，普通会话不预留空白。

验证：完成模块后集中跑现有团队/线程与隔离实际Harness/Chrome交互，不发模型、不写真实任务、不重启共享服务。

未完成：模块/真实框架验证、源码副本回滚与四件套、普通main整合、运行资产/安装包生效层级核对。不触碰截图中的历史错误或重放原会话。

集中结果：34/34团队/归属单元通过，真实隔离Harness/Chrome25项通过（含旧版普通线程默认团队复现、修复后栏与入口同时消失、0预留宽度、普通浏览器保留、原生输入器DOM身份、切换草稿保留、Bot已绑定会话团队保留、原生搜索/分组/群入口）。0模型、0真实数据/共享3080写入。原ContextPanel业务块保持等价，只抽取原视图标记逻辑供ThreadChrome复用，普通线程保留原浅色框架/隐藏轨迹，不因移除团队反向改变原设计。

验证注意：空Bot home是原生welcome composer，不渲染会话header，因此不能在那里断言团队栏；使用真实绑定且有历史的Bot Session验证。旧任务overview夹具并无历史条目，不把sidebar同名字幕当任务历史已可点；测试只通过注入的ctx公开uiWorkspace.openSession导航到隔离真实Session，未替换store/组件或写消息。浏览器按钮为原生可访问名包含浏览器，而非固定完全相同名称。前述QA断言失败均保留，修正轨迹后25项通过。

源码原件hash与修改件见manifest；baseline31/31、另一副本restore31/31、portable ZIP4项CRC和原件hash通过。尚待main普通合入与运行资产加载。当前Desktop托管服务0.4.5；本轮不改已安装包/托管manifest或lease，不停服务。若热加载仅当前profile资产，后续启动同步旧包可能恢复旧展示，持久生效需包含本修复的新包，分别记录。

最终收口：功能已普通合入并推送main 2a4e21a；再次整合2f6d37b原生业务工具主线，保留模型恢复。四件套位于evidence/thread-team-visibility，31基线/34修改/25真实隔离UI/31副本恢复通过。单资产加载命令在任何写入或拿锁前因3080 ECONNREFUSED退出1，运行未加载；用户服务无监听，未擅自启动旧托管服务、不碰其他线程隔离验收端口。不改已安装包、journal、模型或业务数据。后续运行加载/含本提交的新包仍是未完成门；不能以main合并代替上线。功能模块迭代计数1，收尾证据不新增发布计数。
