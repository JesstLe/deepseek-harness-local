# Naumi 定制版 — 实现记录

## 对象与归属

- Harness 定制工程：`E:/Workspace/deepseek-harness-local`，官方 npm 发行包作为底座，新增独立 Cordis bundle，不改 node_modules。
- 设计中心：`https://47.105.59.142/dashboard`；本地 `E:/Workspace/naumi`。本次只读核对，不发布47。
- 企业协作：`http://127.0.0.1:3112/workbench`；运行源码经进程核对为 `E:/Workspace/naumi-design-ops`，不是旧 naumi-co。现有未提交修改保持原样。

## 已确认实现方向

Naumi 品牌和浅色外壳、原生业务工作台/项目需求/交付/设计中心面板。会话、工作区、模型、工具、审批、文件、插件设置继续由原生 Harness 所有者实现。业务任务与本地文件工作区分开建模，不将目录称作企业项目。

协作只读适配只转发 `design_ops_session` 到固定的3112，不转发 Harness Cookie/API Key，不转发到47。请求必须通过 Harness Connection 的Host/Origin/身份检查；来源协作服务仍鉴权并执行租户/角色过滤。业务写操作跳回原系统；本轮不新造跨系统审批或派单权限。

选中任务可显式将已鉴权的任务摘要放入原生会话草稿，不自动发送到模型，不自动提交、批准或验收。无登录、访问待分配、网络失败均用真实状态，不使用演示业务填空。

## 当前进度

- 已完成：独立插件加载、Naumi品牌槽位与浅色界面、中文语言扩展、原生五个业务面板、只读业务接口、业务Cookie隔离、任务草稿衔接、原生模型/会话/工具入口保留、桌面启动入口。
- 已验证：14项模块测试；HTTP根页面/5个资源/登录令牌/鉴权；五个业务面板切换；桌面与390px无整页横溢出；任务上下文到原生输入框草稿（显式夹具，未发送模型）；原9个模型分组/默认设置完全相同；配置副本回滚。
- 实际页面的当前DOM与样式已导出为静态渲染附件 `evidence/naumi-ui/current-ui.html`、`workbench-render.png`。它是当前未登录状态的DOM渲染，不是登录后的业务数据截图；保留的首轮真实浏览器截图仅说明早期外观，不冒充最终版本。
- 待真实账号验收：用户已报告登录，但T3预览仍在3112/login，3080桥接仍返回401。未复制Chrome登录Cookie，未绕过权限或造真实业务数据。只读业务成功分支由模块测试覆盖，真实企业的读取仍待同一浏览器会话取得有效登录态。
- 未做：业务写命令代理、审批授权改造、跨站SSO、47部署、其他源项目改动。创作工具入口打开真实47页面，不是将其整个功能迁移到3080。

## 插件职责与版本

`plugins/naumi-enterprise` 拥有品牌、只读业务投影、五个原生面板和任务上下文编辑。`plugins/naumi-ui-layout` 是原生AppFrame的固定版本载体，只替换浏览器模块注册ID与硬编码产品标题，布局/会话代码逐字节反替换验证一致；MIT与原作者信息保留。源依赖目录不修改。汉化通过 `zh-Naumi -> zh` 语言回退，Hero去掉宣传标语。

`Start-DeepSeek.ps1` 增加进程启动互斥，避免两个入口同时启动导致PID文件互相覆盖；`Start-Naumi.ps1`/`Stop-Naumi.ps1` 是兼容包装。桌面入口 `Naumi 企业协作` 打开仍受原令牌鉴权的3080。

## 运行与维护

```powershell
cd E:\Workspace\deepseek-harness-local
.\Start-Naumi.ps1 -Open
.\Stop-Naumi.ps1
npm run naumi:test
npm run naumi:build
npm run naumi:sync
```

修改插件后集中运行模块测试、同步、重启。新机器在 `npm ci` 后执行 `npm run naumi:install`；它安装两个本地包并追加Naumi bundle，保留既有profile与凭据。两个站点地址在 `plugins/naumi-enterprise/cordis.patch.yml` 明确配置，页面参数不能指定任意代理目标。

回滚默认仅验证独立副本：`bash evidence/naumi-ui/ROLLBACK.sh rollback-test`。实际撤销使用 `rollback`，校验当前manifest与本轮记录一致后恢复原bundle清单，重启生效；后续修改时拒绝覆盖。模型配置、凭据、会话和两个业务站点数据库均不触碰。私有manifest原件在 `.dsh/naumi-ui-backup`，不进入Git。

## 调试记录

浏览器截图帧有时中断，Chrome连接器超时，原生Chrome通道因URL验证终止；后续只使用已授权T3页面，不再操作原生Chrome。首轮客户端括号错误在部署前修复；目录注册metadata不能直接改名，改为禁用原layout行并插入固定版本Naumi载体。草稿衔接不能在异步 `startSession` 后立即调用 `selectPanel`，否则取消自身导航；现在由原生会话导航单独负责。草稿浏览器验证使用 `NAUMI_UI_FIXTURE` 标记，恢复真实fetch后清除了其唯一空白会话草稿；未发送测试内容到模型。

## 完成口径

本地定制运行、原始功能回归与业务读取分别给证据。只读业务聚合不等于写流程/SSO集成，模型目录不等于所有供应商在本轮重新收费调用通过。此模块不改两个业务系统的数据库结构、业务记录或部署配置；一次失败的旧测试账号登录可产生系统正常认证限流日志。
