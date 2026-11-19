# 47 企业协作接线

## 模块与职责
本线程负责Desktop端现有企业桥、linked工作台接续、官方部署中央登录导航与兼容状态；不改企业协作源码、账号、角色、数据库或线上部署。基线main `4eec4743952491897d0786b00ead3a3d37e8eab6`；分支`codex/enterprise47-connect-20261119`；worktree `D:/NaumiBuild/enterprise47-connect-20261119`。

## 公共接口、依赖方向、数据/状态/事务归属
- 正式协作地址 `https://design-ops.47.105.59.142.sslip.io`。复用EnterpriseSession、DesktopEnterpriseTransport、原工作台 `/naumi/workspace` 与EmployeeSync，不复制登录Cookie或另建企业执行链。
- 已登录官方47账号的正式安装：仅在原home没有明确企业配置时预置官方协作地址。既有其他企业配置优先，配置地址不代表登录、设备登记或上传授权。
- 原linked服务也配置独立账号/企业session及签名enterpriseOrigin，仍沿用原home/端口/会话/Bot/模型；不选择新的空工作台。安装升级先正常退出旧owned worker后，新启动才配置新origin。
- 官方协作窗口允许精确中央身份origin的OIDC auth/session-end及interaction路径。线上还会跳到`/?auth=sign-in&redirect=<interaction>`再到dashboard；仅允许auth=sign-in、唯一且精确的interaction相对返回路径、无额外参数的登录页跳转，不开放普通dashboard浏览。企业callback由企业端原state/nonce/PKCE校验。其他域名、其他路径及自定义企业继承中央issuer均不允许；无Node/preload。
- 活的旧worker推迟首次绑定，避免改变已签名的enterpriseOrigin。已有设备登记或待发私有数据必须显式迁移，不自动换企业、删除登记或上传。

## 调研与本次实现状态
- 实际HTTPS：`/api/workspace`401/UNAUTHENTICATED；`/login`200；`/api/auth/central/start`303到47 `/api/identity/auth`，后续到 `/api/identity-interaction/<id>`。中央discovery200。
- 实际 `/api/digital-employees`404，当前已部署协作main不含digital-employees服务。仅接入已有工作区读取与登录，不将本地已有设备/任务工具冒称线上可用。目录404映射为明确“企业数字员工服务尚未部署”，不反复提示密码错误、不自动登记或上传。
- 基线四模块60/60，exit0。完成代码后集中验证；原始哈希、修改副本及回滚证据位于`evidence/enterprise47/`。

## 验证与未完成项
- 最终源码全仓938/938，exit0；定向覆盖旧worker、既有设备/待发数据、原session桥与目录HTML404。Electron44主进程实测支持node:sqlite只读核查，不依赖开发机Node回落。
- 实际固定包旧3.9服务→4.3、原home/额外插件、真实47工作区401、数字员工503明确状态、中央真实登录跳转到带interaction返回路径的登录页、无Node/preload、GUI退出owned worker、重开数据保持：16项通过，模型调用0、企业业务写0、真人登录0。
- 首轮原生验收暴露三项集成缺口：首次linked candidate未初始化企业桥、原生桥先拦截HTML404、中央interaction继续跳到统一登录首页。已分别补齐并集中复验；runner环境删除配置的问题也已修正，初次日志保留，不把失败覆盖成通过。
- 固定main `2e32726ede8a828231c02c08779af608966cbbe9`；33个asar顶层可执行/UI文件对固定main核验（CRLF→LF规范化）；45,658个backend运行文件逐SHA一致，closure PASS、私有路径0。最初NSIS压缩在原生发现问题后主动中止；最终使用上述已复核unpacked经原stock NSIS管线重新封装，不发布初始候选。
- 副本回滚恢复10个原文件、删除5个新增文件，原60项基线通过；活动源码保留修改。四件套原件哈希、补丁检查与ZIP CRC均核验。
- 实际安装与发布状态随后补充。真实员工SSO由本人正常登录；不借部署会话、不伪造用户、角色或任务。数字员工登记/绑定/自动交稿待企业侧合入并发布对应模块，保持独立状态。

功能模块计数1；后续更新本记录。
