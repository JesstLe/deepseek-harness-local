# Naumi 0.3.7 日常数字员工完整候选

模块与职责：本线程负责D5最后候选版本、固定main构建、包含最新D1–D4/会话导入/单一文件交付的安装更新验收。基线8715b7d97c5a3ea08f8dde777ab948fe16b5bc42，分支codex/daily-release-037-20261118，独立工作树E:/Workspace/naumi-daily-release-037。企业模块保持现状，不扩展/迁移或自动启用。

公共接口/依赖/数据归属：复用现有electron-builder固定NSIS engine、标准卸载器/维护锁、原更新器与GitHub latest.yml，不新写安装事务。只调整desktop/package、lock根版本、product-version和用户更新日志；不改导航/Logo、原输入器、登录/权限/企业路由。原有Codex/Claude导入、目标/任务/交付、记忆和主动机制随最新main完整打包，不用旧stage冒充。

本次状态：0.3.7版本元数据已准备；GitHub只读确认当前Latest稳定0.3.6。原0.3.6公开包不含后来的目标关联/会话导入/原生文件验收；新版本必须从合入本元数据的固定main重新stage/build，runtime inventory和全部plugins hash核对，不能只改版本名。继承最新main810/810全仓、21完整隔离真实链路及9单一路径真实回归；本版本集中跑更新/安装器模块与真实安装包，不重复收费模型。

验收矩阵：固定main构建 -> staged closure/隐私扫描/Logo/CLI/浏览器与关键模块入包 -> 原生安装包源码版本与文件hash -> 独立当前用户slot从公开0.3.6升级0.3.7 -> 隔离profile会话/员工记忆/人设/文件保留 -> 原生打包应用登录、工作页/导入入口/检查更新 -> 卸载保留数据且原HKLM/ProgramFiles/快捷方式保持 -> 新版本公开资产和latest.yml -> 匿名下载hash -> 旧0.3.6客户端获取真实新版本 -> PRD逐项审计。发布前不把构建或测试exit0当公开发布。

未完成：候选元数据验证、源码副本回滚/四件套与main、实际build/install/update全部门槛。旧安装器slot验收脚本会写HKCU和快捷方式，须先只读快照确认没有现存用户slot，不覆盖用户已有安装；只用自有隔离profile，不读取/复制真实密码、密钥或业务会话。整体Goal active。


## 构建、安装、发布收口

固定main3897fba9971f3e08aee6c793419e803e41216bcf重新stage/build，45650文件、closure PASS、privatePaths0，npm build exit0。0.3.7 EXE495305085字节，SHA256 1a0c96e99b35f31f722bf3c6450bfe4fa7ba8cbdff8acfe3505323d8a8b83e43。实际打包主进程/内置后端、登录、设置右侧检查更新与钉钉CLI readonly通过。

真实/currentuser独立slot中，public0.3.6安装→0.3.7覆盖升级→卸载全部exit0；同issuer/账号/home的原生Session保持，人设/记忆/二进制保持，45,650安装文件逐项hash通过；本轮捕获的原快捷方式、HKLM和ProgramFiles保持。新QA脚本复用原库存安装/卸载逻辑，CLI只指向自有目录，不覆盖真实用户安装。

原生webview本机页面输入/负向wheel向下滚动/两窗口尺寸/恢复通过；认证服务中断时活跃本地RPC仍可读，冷启动按现有身份策略要求服务器、不启动worker、不生成新离线grant，原数据字节保持。首轮QA错误和对应修正均留证，不把它们计成产品通过。

GitHub v0.3.7已公开Latest，tag固定3897fba；匿名HTTP200实收495305085字节，SHA256/SHA512与latest.yml一致。真实public0.3.6客户端使用原默认镜像/GitHub源获取0.3.7、下载校验到ready；仅QA通知选择稍后，未宣称自动重启安装，真实覆盖升级已另行验证。首轮实际下载完成后的报告变量错误保留，复测使用同一验证缓存。

逐项核对见DAILY_EMPLOYEE_ACCEPTANCE_AUDIT.md。最终只提交QA/文档/证据，不改变3897发布产品；Goal对象在最终Git/四件套重开后由工具收口。企业模块保持现状，原私密配置不打包。当前目录下四件套是本版本源码/QA归档，不是500MB安装包本体。
