# 员工设置入口收口验收

模块与职责：仅设置导航收口为通用设置、模型连接、MCP，Blender移入MCP；负责人本线程，基线e6cdab40b5f428ba78dd0943c62771d42ecf8354。实现与职责见[EMPLOYEE_SETTINGS](../implementation/EMPLOYEE_SETTINGS.md)。

公共接口、依赖方向、数据/状态/事务归属：复用原生SettingsRoot和原模型/Blender组件；局部过滤rows和隐藏配置文件动作。所有插件注册、后端执行及权限保持。构建与开发同步共用固定SHA适配器，不另造壳。

本次实现与迁移状态：1个UI切片。固定mainfd5d4555646191f921f45d4933c15d6b7b34c4a1已实际两文件增量加载；HTTP200，PID39080，107sessions/0running/4bots/revision47。169无关运行文件和6配置/账本原字节、Bot/task/group/model/员工export保持。安装器未重建。

验证命令、结果及证据层级：62模块、16真实隔离原生壳检查；11条源码/native包解压核hash，副本回滚后原12基线通过。0模型。首轮启动输出管道超时回滚、协调器中断，以及UI生成1个空白会话均如实保留，最终修复后重载exit0；不把初始UI图当最终重载后第二次浏览器验收。最终原生bundle和资产hash/served source均核对。

未完成项与下一步：本切片已验收，刷新用户工作台读取新模块；不追加其他设置重构、不再重启。完整命令/原件/回滚见[VERIFICATION](../../evidence/settings-simplify/VERIFICATION.txt)。主线同步包含服务对齐与Bot拖拽切片，保留其他内容；分支/worktree只清理本任务资源。
