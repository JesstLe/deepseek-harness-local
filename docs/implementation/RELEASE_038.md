# Naumi Desktop 0.3.8 发布

## 模块与职责
- 负责人：本任务 `codex/release-038-20261118`；工作区 `E:/Workspace/naumi-release-038-20261118`。
- 基线：main/origin main `f48b33833fc8abf367c8541616b236d741846454`。用户明确要求发版。
- 产品变化仅版本元数据、更新日志；已有 Bot 主聊天切片及旧后端更新入口修复从最新 main 完整打包。不追加模型调用、真实任务、配置迁移、规则或企业改动。

## 公共接口、依赖及数据归属
- 复用原有 prepare-runtime、electron-builder 标准 NSIS、原生更新器与 GitHub Release/latest.yml。
- 复用0.3.7隔离安装和原生打包验收脚本，新增0.3.8 runner；原真实用户安装、快捷方式、3080及个人profile不作为安装目标。
- 固定 main 构建；GitHub明确指定 `JesstLe/naumi-desktop`。0.3.7公开资产保留；0.3.8以新tag发布，不覆盖旧版本。

## 实现与迁移状态
- desktop/package及lock根版本、PRODUCT_VERSION、CHANGELOG提升0.3.8。
- 安装目标为自有/currentuser中文空格目录；先只读检查HKCU/菜单占用，无冲突才使用原安装器验收。旧0.3.7→0.3.8→卸载，保留隔离原生会话、员工人设/记忆/二进制，真实HKLM/ProgramFiles/快捷方式核对保持。
- 不对真实用户强制安装或重启；公开发布后的旧客户端只验证获取/下载到ready，QA通知选择稍后。

## 验证及证据层级
- 基线：`node --test --test-concurrency=1 desktop/tests/updates.test.cjs desktop/tests/installer-maintenance.test.cjs desktop/tests/installer-ui.test.cjs`，42/42，exit0。
- 前一功能固定树全仓828/828、原生隔离17项及实际导航19项已在main留证；本版做发布相关集中测试及真实安装更新，不重跑收费模型。
- 构建、安装、发布和匿名下载状态将在实际完成后追加；四件套只作源码/发布验收归档，不代替安装包本体。

## 未完成项与下一步
- 固定版本合main→重新stage/build→包完整性/隔离升级→公开Release及默认更新源验证→证据重开与清理。
- 功能迭代计数0（发版切片），发布计数待真实公开后记录。

## 固定构建与打包验收
- 版本切片普通合main87d2460136547d19459c59d8b6c77fe0487ec9a6并push；`npm --prefix desktop run build` exit0，全部重新stage，45,650运行文件，closurePASS/privatePaths0。
- Naumi-Setup-0.3.8-x64.exe：495308146字节，SHA256 df0a9e441d6e590ffda0d2cf7ff9b35cab10bd34b92f2d1e167821b690e447de。staged与win-unpacked逐文件hash通过，15项Bot主聊天/任务层级/更新入口相关模块在plugins与实际加载namespace两份均与固定源码一致。
- 实际Electron打包应用（独立identity/profile/随机端口）登录、内置backend、设置右侧检查更新、固定home/重复点击不建Session/任务次入口/返回主聊天、新self-task API marker、钉钉CLI readonly与退出worker均通过，0模型调用、0次3080操作。
- 原生最新清单未提供可选files[0].size，QA首次断言失败已保留；改为可选字段存在时核验，实际EXE字节/SHA512/GitHub资产size始终严格校验。仅QA修正，未改变已构建产品。
- 119集中测试与源码副本42/42；回滚初轮缺desktop依赖junction失败保留，补自有副本junction后通过。四件套保存8路径原件和修改SHA、ZIP CRC与可执行rollback；当前0.3.8元数据保持。
- GitHub draft0.3.8已上传，target87d2460；两资产API digest与本地SHA匹配，尚待安装升级门通过才公开。

## 安装升级及公开状态
- public0.3.7 EXE SHA256 1a0c96e99b35f31f722bf3c6450bfe4fa7ba8cbdff8acfe3505323d8a8b83e43验证后用于自有/currentuser中文空格slot；旧版安装exit0、0.3.8覆盖升级exit0、0.3.8卸载exit0。
- 两版使用同fixture issuer/account/home；原生session ID保留，隔离员工记忆、人设、二进制原值保留，安装后45,650文件逐项hash通过。原HKLM/ProgramFiles与捕获的真实快捷方式hash保持。卸载保留fixture profile；用户真实安装未升级或改链。
- GitHub v0.3.8已公开稳定Latest（2026-11-18T02:17:51Z），tag固定87d2460，原0.3.7资产未覆盖。匿名下载和public0.3.7默认更新源下载至ready继续核验；不强制真实用户重启。

## 公网核验与真实更新下载状态
- 正式稳定Latest v0.3.8、tag87d2460已通过GitHub只读回查。草稿资产digest与本地一致；0.3.7原资产SHA未变。
- 公网首次单连接匿名下载和真实旧客户端首次下载在104972288字节附近被对端关闭；public日志UND_ERR_SOCKET、原生旧客户端UPDATE_DOWNLOAD_FAILED如实保留。此轮未计ready通过，不在QA中预置缓存伪装客户端下载完成。
- 匿名验证改用同一官方资产的标准HTTP Range续传，逐段要求206/精确Content-Range/总大小；完整495308146字节SHA256和SHA512与本地产物及latest.yml完全一致。原始失败前缀也经最终全文件hash核对。PUBLIC.json=PASS。
- 真实public0.3.7客户端已从未改变的默认mirror/GitHub源读取0.3.8版本和本版更新日志，并实际开始下载；本机本次完整单连接下载验收保留网络中断状态，未宣称ready、自动安装或真实用户升级。提供已完整验证的本机EXE及公开下载链接。
- 发布动作与公开完整包校验已完成；网络中断作为独立验收结果保留，不改0.3.8产物、不改代理/账号/用户模型配置、不扩大到更新器重构。
