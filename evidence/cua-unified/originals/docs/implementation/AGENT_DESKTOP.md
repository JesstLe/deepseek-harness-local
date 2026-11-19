# agent-desktop 集成记录

## 目标

作为Naumi内置桌面操作能力提供，员工无需全局npm、手动MCP配置或另选模型。使用上游原生二进制和Harness既有MCP/skill桥接，不改模型、业务接口、权限和UI布局。

## 版本与来源

- 上游：https://github.com/vercel-labs/agent-desktop
- npm固定版本：`agent-desktop@1.3.1`，Apache-2.0。协议JSON envelope版本2.6与发行版本1.3.1不是同一概念。
- 本次检查npm包包含win32/darwin/linux、x64/arm64二进制及SHA256旁车文件。安装采用`--ignore-scripts`，不运行postinstall下载/全局链接/技能安装；直接调用已打包的原生文件。
- GitHub公开API限流；以npm发布元数据、发布包与v1.3.1许可证为本次版本依据，而不是把main文档当作锁定产物。

## 接线

- 根package.json/lock固定CLI依赖。
- Naumi现有bundle的host入口调用`installAgentDesktop`；只有tools/skills服务就绪后加载。
- `desktop-runtime.js`按包位置解析当前平台二进制，检查版本和SHA256，不依赖工作区绝对路径、用户PATH或npx下载。
- 通过现有`@deepseek-ai/dsh-mcp-client`启用`naumi_desktop`命名空间，stdio默认headless，session命名空间naumi，不自动添加--headed/--force/trace。
- 通过单独filesystem skill provider提供`naumi-desktop`使用指引，不覆盖员工/项目原有技能。
- `scripts/agent-desktop.mjs`为管理员和排障提供本地CLI入口，原样传参，不经过shell拼接。

## 员工发行

发行产物需包含根runtime依赖及Naumi插件files中的新模块、skills和third-party。原生二进制已在npm包内，不要求员工首次启动联网下载。Windows本机验收不代表macOS/Linux或完整员工安装包已经验收；操作系统可能仍需要个人授权。自有企业登录与API下发保持后续独立模块。

## 验收结果（2026-11-16）

- Windows x64原生CLI version/status通过，二进制SHA256为`a7ef5e539fb97287a35eb9ed49d3803b4d6bd705bc4106eb28617229f9be679e`。
- 真实Harness MCP桥接注册75个工具，实际调用desktop_status、desktop_skills_get(platform)成功，dispose后工具数0。
- 本地服务已重启，`http://127.0.0.1:3080` HTTP 200；认证GET /naumi/desktop返回ready、75工具；未认证401、写请求405。
- 真实会话skills/list可见naumi-desktop；模型目录仍为9组；原UI、业务domain、权限配置及profile配置7份文件哈希不变。
- 模块测试36/36通过（原26项+新增10项）；实际Chromium桌面/移动端27/27通过，无前端错误、无模型生成请求，模型选择和草稿均不变。
- 首次沿用旧UI测试时，可选的“未分组”节点不存在，定位超时。新增本模块UI回归脚本仅在该节点存在时折叠，完整重跑27项通过；未为测试改动产品UI或会话数据。
- 插件npm pack dry-run核对15个发行文件，包含适配模块、内置skill、平台指引和Apache许可证。
- 回滚通过真实rollback分支在隔离副本执行，验证恢复7份源文件、删除集成入口及同步副本；当前运行目录仍保持集成。

## 交付与复验

`evidence/agent-desktop/`保存原始文件与SHA256、MCP/HTTP/浏览器报告、变更补丁、离线组件ZIP、VERIFICATION.txt及ROLLBACK.sh。ZIP是本模块交付包，不是员工完整安装程序。固定版本npm tarball放在ZIP的vendor目录，可供后续安装包构建使用。

复验命令：

```powershell
node --test tests/naumi-enterprise.test.mjs tests/naumi-context-ui.test.mjs tests/agent-desktop.test.mjs
node scripts/verify-agent-desktop.mjs
node scripts/verify-agent-desktop-live.mjs
node scripts/verify-agent-desktop-ui.mjs
node scripts/verify-agent-desktop-state.mjs modified
node scripts/verify-agent-desktop-state.mjs rollback-test
```

真实回滚入口为`bash evidence/agent-desktop/ROLLBACK.sh rollback`，会校验后续编辑、恢复当前目录和已安装profile的插件文件；恢复后重启Naumi。不带参数默认只在副本测试，不影响运行实例。不会删除企业数据、会话或npm缓存。

## 后续独立模块

- 完整员工安装包、签名、升级与干净机器验收尚未制作。
- 企业统一登录、服务端URL/API key下发仍是后续设计，不写入当前安装资产。
- 当前实际运行覆盖Windows x64；六平台/架构矩阵只覆盖路径/校验解析fixture，不代表macOS/Linux桌面验收。
- 75个已注册工具不代表全部应用、全部写操作已验收。本次仅调用状态与指引，没有操作员工业务桌面，没有模型付费请求。
