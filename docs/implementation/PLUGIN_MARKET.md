# 员工共享插件市场

## 模块与职责

负责人：本线程 employee-plugin-market。延续既有独立 worktree `E:/Workspace/naumi-employee-plugin-market`，分支 `codex/employee-plugin-market`。接续基线 `e620bd9`；2026-11-17 刷新后的 origin/main 为 `d0412011003e0a8a80902d1b3912af66a1b6aba2`。共享 main 的安装器与群聊证据保持原状。

用户已选择：与 Naumi 账号服务同域部署，复用员工登录态；作品显示真实创作者、下载量与安装用户数。浅色布局复用原生插件页面 tabs，不另造导航或输入器，不修改 Bot 任务、模型配置或品牌图标。

## 公共接口、依赖方向、数据与事务归属

- `market/server.mjs`：仅 `/api/plugin-market/` 前缀；每次请求通过固定账号 origin 的 `/api/auth/session` 校验。作者不是客户端字段，账号标识沿用现有 email 主键契约的哈希命名空间。账号停用、会话撤销与到期继续由原账号服务负责。
- `market/store.mjs`：独立 SQLite/WAL。拥有草稿、不可变版本、下载票据、安装回执、收藏评价和请求幂等回执；不访问模型账务、员工文件、Bot 账本或账号密码。
- `desktop/app/market.cjs`：复用 `IdentityRuntime` 及其 Chromium session，仅允许市场 API 白名单。Cookie 不进入网页、插件、普通配置或日志；不提供通用 URL/HTTP 代理。相同 origin 下更换账号也丢弃旧在途响应。
- `market-native.js`：复用现有受 token 保护的 loopback bridge；请求不会自动重放。账号切换、更新与维护期间检查在途市场操作。
- `market-installer.js`：安装仍调用原生 `pluginManager.installBundle/removeBundle/listBundles`，不另写插件运行时。技能与工作流复用 `dsh-skill-filesystem`；Bot 模板只预填已有创建表单，不自动创建员工、不携带作者权限。
- UI 在原有 `plugins.tab` slot 增加“市场”和“我的作品”，保留“已安装”。提供搜索、分类、排序、创作者筛选、详情、版本、能力确认、导入发布、草稿、下架、更新、回滚、卸载、收藏与安装后评价。

服务端写入通过 SQLite `BEGIN IMMEDIATE` 和 actor+operationId 幂等；草稿 revision CAS，版本不可覆盖。下载在文件响应 `finish` 后按票据记账；安装用户按账号+作品去重，不按点击或更新次数累计。

一期一个市场部署对应一个企业命名空间；只接受固定服务端 tenant，不信任请求中的组织或角色。它不是多企业成员授权系统。账号不可变 subject 和组织授权由统一身份后续阶段提供，见 [UNIFIED_IDENTITY.md](UNIFIED_IDENTITY.md)。

## 本次实现与迁移状态

服务、契约、原生桥接、安装器、打包命令与界面已接续；不迁移旧插件、员工数据、历史会话或工作区。发布包仅包含显式文件清单，拒绝路径穿越、大小写重名、环境文件、保留清单和已知密钥格式。安装前确认版本摘要和声明能力；能力声明是用户确认信息，不冒充 Host 代码沙箱。

2026-11-17 接续时发现旧隔离 UI 测试停在作者按钮的可访问名称断言；头像首字母参与了名称，现为装饰头像设置 aria-hidden。保留首次失败日志，并重跑完整集成，不将旧失败计为通过。

发布位置：现有 Naumi 账号 HTTPS origin 下新增 `/api/plugin-market/`；独立服务监听 loopback 3190。生产配置与验收命令见 [market/README.md](../../market/README.md)，不替换账号应用，不重启 3080。

## 验证命令、结果及证据层级

- 单元/本地 HTTP：`node --test tests/naumi-plugin-market.test.mjs desktop/tests/market.test.cjs`。
- 隔离真实 Harness + 原生 package manager + Chrome：`node scripts/verify-plugin-market.mjs`。账号权威为两账号受控 HTTP，底层安装、升级与回滚真实执行；不是生产员工账号验收，不调用真实模型。
- 全仓回归及副本回滚结果由 `evidence/plugin-market/VERIFICATION.txt` 记录，不把 HTTP 200、构建或 Git 合并当作远端部署。

## 未完成项与下一步

远端首次只读 SSH 探测返回 publickey 拒绝，尚无已验证的部署连接；不记录为已上线。取得部署凭据后，固定 main SHA 构建独立服务、备份原 nginx 配置、只增加市场路由、先 nginx -t 再 reload，验收未登录 401、健康接口与真实双账号发布/下载/安装。生产账号应用和本地 3080 保持不动。

模块计数：服务端、原生客户端、市场 UI 共 3 个切片；已刷新并整合主线至 `e16b369ff0e8384dcb921d5efbf0ecd5b12679bb`，保留 IM 网关、员工日常工作、原生点名及其实际加载证据。首次合并的样式表冲突已通过后续修复提交解决；保留初始失败日志，最终全仓 `649/649`、隔离 UI/原生安装 `14/14`，`page_errors=0`。最后一次主线增量仅文档/证据，不变更已测试业务源文件。

真实隔离安装、升级、回滚已执行；两个受控账号互相看见作品，下载量1、安装用户1，升级不增加安装人数；1360/580/360宽度无市场内容横向溢出。全部隔离测试宿主已关闭，真实模型调用0，未重启3080。

## 可复用接续提示

```text
继续 Naumi 员工插件市场：先读本文件、market/README.md 和 evidence/plugin-market/VERIFICATION.txt。
作者只取现有账号 session；市场与账号同域，Cookie 留在 Chromium session。
复用原生插件 tabs 和 pluginManager，不新增执行引擎或通用网络代理。
分清隔离双账号/真实原生安装与生产员工/远端部署证据。
保留共享 checkout、3080、Bot 账本和模型凭据。只提交本任务明确路径。
```
