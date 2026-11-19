# 47 企业协作接线

## 模块与职责
本线程负责Desktop端现有企业桥、linked工作台接续、官方部署中央登录导航与兼容状态；不改企业协作源码、账号、角色、数据库或线上部署。基线main `4eec4743952491897d0786b00ead3a3d37e8eab6`；分支`codex/enterprise47-connect-20261119`；worktree `D:/NaumiBuild/enterprise47-connect-20261119`。

## 公共接口、依赖方向、数据/状态/事务归属
- 正式协作地址 `https://design-ops.47.105.59.142.sslip.io`。复用EnterpriseSession、DesktopEnterpriseTransport、原工作台 `/naumi/workspace` 与EmployeeSync，不复制登录Cookie或另建企业执行链。
- 已登录官方47账号的正式安装：仅在原home没有明确企业配置时预置官方协作地址。既有其他企业配置优先，配置地址不代表登录、设备登记或上传授权。
- 原linked服务也配置独立账号/企业session及签名enterpriseOrigin，仍沿用原home/端口/会话/Bot/模型；不选择新的空工作台。安装升级先正常退出旧owned worker后，新启动才配置新origin。
- 官方协作窗口允许精确中央身份origin的OIDC auth/session-end及interaction路径，企业callback由企业端原state/nonce/PKCE校验。其他域名、其他路径及自定义企业继承中央issuer均不允许；无Node/preload。

## 调研与本次实现状态
- 实际HTTPS：`/api/workspace`401/UNAUTHENTICATED；`/login`200；`/api/auth/central/start`303到47 `/api/identity/auth`，后续到 `/api/identity-interaction/<id>`。中央discovery200。
- 实际 `/api/digital-employees`404，当前已部署协作main不含digital-employees服务。仅接入已有工作区读取与登录，不将本地已有设备/任务工具冒称线上可用。目录404映射为明确“企业数字员工服务尚未部署”，不反复提示密码错误、不自动登记或上传。
- 基线四模块60/60，exit0。完成代码后集中验证；原始哈希、修改副本及回滚证据位于`evidence/enterprise47/`。

## 验证与未完成项
待集中类型/单元、真实Electron与HTTPS、固定main构建和实际安装接线。真实员工SSO由本人正常登录；不借部署会话、不伪造用户、角色或任务。数字员工登记/绑定/自动交稿待企业侧合入并发布对应模块，保持独立状态。

功能模块计数1；后续更新本记录。
