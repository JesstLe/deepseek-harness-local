# 已安装新版仍显示旧版本 / 检查更新缺失

模块与职责：只修复开发期遗留桌面入口与 linked 本地服务的更新展示接入；不重建会话执行器、输入器或更新器。

基线：main/origin/main de4c321da2a152eec70bca0bb874ff66c2a7e12a。负责人为本任务；独立分支 codex/update-entry-fix-20261118。代码归属仅新 repair/QA 脚本、新测试及本记录，不覆盖并行线程 host/client 源码。

公共接口、依赖方向、数据/状态/事务归属：沿用已安装 app.asar 原生 updateState/checkUpdates/onUpdateState IPC、原 sidebar.footer.action slot、原 desktop-updates 组件。backend-link 指向用户原 .dsh，不移除 link、不切换账号 namespace、不迁移任何用户数据。运行服务依赖原生维护脚本，running=0 才短暂停服加载。个人桌面旧快捷方式仅在已识别的 Naumi/client-builds 原件标记存在时改指正式安装；不碰外部同名快捷方式。

调研结论：C:/Program Files/Naumi 是0.3.7；个人桌面 Naumi.lnk 指向旧 client-builds 的0.3.5，遮蔽公共桌面的0.3.7。APPDATA/Naumi/backend-link.json 让安装版连接原3080服务；该运行副本 product-version.js 仍0.3.2，client/host 缺少 desktop-updates 接入，故新版安装包自己的 UI 代码没有生效。不是只改footer文字即可修复。

本次实现与迁移状态：提供受保护的增量修复命令，从实际安装版复用其更新组件/样式/slot effect，给旧 host 添加两条静态资源及样式，更新 product-version 为安装版版本；只计划五个运行文件。原client/host其他字节保留，整个安装目录不修改；原快捷方式/运行原件先保存并逐项CAS核对。失败恢复运行原件与快捷方式。企业功能和模型配置保持。

验证命令、结果及证据层级：node --test tests/desktop-update-entry-repair.test.mjs tests/desktop-update-ui.test.mjs tests/naumi-product-identity.test.mjs desktop/tests/updates.test.cjs，39/39 PASS。实际安装版主进程/preload与原3080 backend联调（独立QA账号服务及profile，无用户密码）：baseline installed0.3.7/footer0.3.2/update_entry0；modified installed0.3.7/footer0.3.7/update_entry1，原生IPC点击检查至已是最新版本、设置同排右侧（以中心线对齐，不要求42px/36px不同高度按钮顶边相同）、Escape关闭通过。真实加载main35fe459；running0才短停服加载五文件，前后106sessions/0running/4bots/revision47；150无关运行文件、4个模型/运行配置hash保持，原backend-link与安装ASAR保持。当前用户身份目录未参与QA。

副本回滚：交付ZIP包含运行修改五文件与快捷方式、四份原件和manifest；ROLLBACK.sh只接受标记副本且先核对全部修改hash，恢复原host/client/0.3.2元数据与旧快捷方式、删除新增更新JS/CSS。独立解压副本恢复与无标记/文件已改拒绝的结果见ROLLBACK.log；实际修复保持0.3.7，不执行真实回退。

QA错误如实保留：首轮漏勾独立fixture的本地归属确认；第二轮错误地在设置面板打开前查版本；修改后两次使用顶边而非中心线比较不同高度按钮；第三次更新fixture漏处理electron-updater的缓存查询参数。均只修QA代码，失败日志保留，不计为产品通过。最终版本/入口/原生检查结果见MODIFIED.json。

迁移状态：功能源码已普通合入推送35fe459，本机五文件及快捷方式已应用；最终QA/文档/四件套归档在本分支收口后普通merge/push。3080重启窗口已工具正式释放给Bot主聊天切片，该线程后续十文件不得覆盖本次presentation五文件；本任务不再重启/发模型或操作共享UI。

未完成项与下一步：本修复不重发已有公开0.3.7，不冒称新安装器已包含遗留开发目录自动迁移。旧网页标签仍需正常刷新以获取新的ES module；桌面重新打开使用已修复快捷方式。当前验收的检查feed为受控同版本清单，真实公开分发仍引用此前0.3.7验收而不重复宣称本轮重新下载。企业模块、真实密码/会话/任务和既有更新安装门禁不改变。
