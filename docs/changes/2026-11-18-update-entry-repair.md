# 已安装新版仍显示旧版本 / 检查更新缺失

模块与职责：只修复开发期遗留桌面入口与 linked 本地服务的更新展示接入；不重建会话执行器、输入器或更新器。

基线：main/origin/main de4c321da2a152eec70bca0bb874ff66c2a7e12a。负责人为本任务；独立分支 codex/update-entry-fix-20261118。代码归属仅新 repair/QA 脚本、新测试及本记录，不覆盖并行线程 host/client 源码。

公共接口、依赖方向、数据/状态/事务归属：沿用已安装 app.asar 原生 updateState/checkUpdates/onUpdateState IPC、原 sidebar.footer.action slot、原 desktop-updates 组件。backend-link 指向用户原 .dsh，不移除 link、不切换账号 namespace、不迁移任何用户数据。运行服务依赖原生维护脚本，running=0 才短暂停服加载。个人桌面旧快捷方式仅在已识别的 Naumi/client-builds 原件标记存在时改指正式安装；不碰外部同名快捷方式。

调研结论：C:/Program Files/Naumi 是0.3.7；个人桌面 Naumi.lnk 指向旧 client-builds 的0.3.5，遮蔽公共桌面的0.3.7。APPDATA/Naumi/backend-link.json 让安装版连接原3080服务；该运行副本 product-version.js 仍0.3.2，client/host 缺少 desktop-updates 接入，故新版安装包自己的 UI 代码没有生效。不是只改footer文字即可修复。

本次实现与迁移状态：提供受保护的增量修复命令，从实际安装版复用其更新组件/样式/slot effect，给旧 host 添加两条静态资源及样式，更新 product-version 为安装版版本；只计划五个运行文件。原client/host其他字节保留，整个安装目录不修改；原快捷方式/运行原件先保存并逐项CAS核对。失败恢复运行原件与快捷方式。企业功能和模型配置保持。

验证命令、结果及证据层级：待模块集中测试、真实安装版+legacy backend 复现与复核、另一副本回滚后追加。已有0.3.7独立打包验收不是该 legacy-link 场景的证明。

未完成项与下一步：完成上述验收、普通merge/push；从新正式桌面入口核对。现有公开0.3.7安装包不重发同版本；这次是本机遗留集成修复，不冒称新安装器已包含自动迁移。UI验收使用隔离测试配置，不读取用户密码、不调用模型或重放用户任务。
