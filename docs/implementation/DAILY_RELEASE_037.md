# Naumi 0.3.7 日常数字员工完整候选

模块与职责：本线程负责D5最后候选版本、固定main构建、包含最新D1–D4/会话导入/单一文件交付的安装更新验收。基线8715b7d97c5a3ea08f8dde777ab948fe16b5bc42，分支codex/daily-release-037-20261118，独立工作树E:/Workspace/naumi-daily-release-037。企业模块保持现状，不扩展/迁移或自动启用。

公共接口/依赖/数据归属：复用现有electron-builder固定NSIS engine、标准卸载器/维护锁、原更新器与GitHub latest.yml，不新写安装事务。只调整desktop/package、lock根版本、product-version和用户更新日志；不改导航/Logo、原输入器、登录/权限/企业路由。原有Codex/Claude导入、目标/任务/交付、记忆和主动机制随最新main完整打包，不用旧stage冒充。

本次状态：0.3.7版本元数据已准备；GitHub只读确认当前Latest稳定0.3.6。原0.3.6公开包不含后来的目标关联/会话导入/原生文件验收；新版本必须从合入本元数据的固定main重新stage/build，runtime inventory和全部plugins hash核对，不能只改版本名。继承最新main810/810全仓、21完整隔离真实链路及9单一路径真实回归；本版本集中跑更新/安装器模块与真实安装包，不重复收费模型。

验收矩阵：固定main构建 -> staged closure/隐私扫描/Logo/CLI/浏览器与关键模块入包 -> 原生安装包源码版本与文件hash -> 独立当前用户slot从公开0.3.6升级0.3.7 -> 隔离profile会话/员工记忆/人设/文件保留 -> 原生打包应用登录、工作页/导入入口/检查更新 -> 卸载保留数据且原HKLM/ProgramFiles/快捷方式保持 -> 新版本公开资产和latest.yml -> 匿名下载hash -> 旧0.3.6客户端获取真实新版本 -> PRD逐项审计。发布前不把构建或测试exit0当公开发布。

未完成：候选元数据验证、源码副本回滚/四件套与main、实际build/install/update全部门槛。旧安装器slot验收脚本会写HKCU和快捷方式，须先只读快照确认没有现存用户slot，不覆盖用户已有安装；只用自有隔离profile，不读取/复制真实密码、密钥或业务会话。整体Goal active。
