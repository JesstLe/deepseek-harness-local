# Desktop 创作 MCP 接线

## 模块与职责
负责人：本线程；分支 `codex/desktop-creation-mcp-20261118`；worktree `E:/Workspace/naumi-creation-host-20261118`。基线 `5ffd5f757da8de1859a1cf21c5f4940e465137b3`，已 fetch。共享 checkout 未提交证据保留。

Naumi固定交付：main `8dcf44189ebad64c289ec333063486a00ccfb447`；client1.1.0/Gateway1/Node18+；zip SHA256 `fb80970a4a0f0d8fc69d6502a6029c694a89c076f963b534f2f43e3d0434e803`；manifest SHA256 `c32e6acb697c30cfab6e89928f23ad466e3eb52b7b9b15bca3f369aee03d0ac0`。已校验，固定字节放入third-party，不读已清理的Naumi工作树，不改Naumi源文件。

## 公共接口、依赖方向、状态归属
- Electron账号页拥有明确授权入口；复用已有identity，不新建用户/令牌表。用户在原账号中心创建专用令牌，原生密码框接收，系统safeStorage保存；运行文件在账号根目录、Agent cwd之外，Windows DACL限定当前用户，POSIX0700/0600。OS加密不可用时不降级为明文持久化。
- Host从本地账号描述符读取非秘密绑定，在每个Agent Session scope中调用已校验的官方adapter，使用现有MCP/Skill插件；不在全局注册个人凭据。
- Host只拥有提交前意图日志（site/account/tokenId/workspace/sessionId/outerUUID/完整原参数）、下载回执和本地生命周期，不拥有远程任务/作品/账本。状态查询必须匹配原绑定；新账号/新token/新scope不接管历史回执。
- 文件交付以成功下载回执为来源，经固定adapter校验实际文件，再通过原tools.execute执行原present，沿原审批/事件系统，不拼造文件卡。
- 安装不是就绪；真实namespace、naumi_connection的账号/token/预算均需核对。切换/登出await scope dispose；不取消已受理远程任务。

## 文件归属与实现迁移
本次独占新增creation-*模块、固定vendor、测试/脚本/本文；host/client/package只追加入口；desktop main/preload/identity页/backend只做账号vault及生命周期接线，runtime扫描追加敏感文件排除。其他导航、模型、Bot任务、群输入器、Blender不改。

## 验证命令、结果及证据层级
实施前保存原字节/hash，执行相关基线。完成完整切片后集中单元、真实Harness MCP+HTTP、Windows ACL/原生safeStorage、原present executor验证。Naumi侧23项Next/PG链是上游证据，Desktop本地替代服务不冒称生产/真实供应商。

## 未完成项与下一步
本地接线已实现，集中回归与主线收尾中。不发布47、不进行生产收费；不把93项source schema当全部可用。保留上游历史tenant回执授权缺口；通用项目CRUD/图片文字节点/连线布局、视频音频上传尚未闭合。安装器EXE本轮不重建。模块迭代计数1。

## 本地切片结果
- 相关基线：node --test desktop/tests/identity.test.cjs tests/agent-desktop.test.mjs tests/naumi-enterprise.test.mjs，45/45，exit0。
- 模块：node --test tests/naumi-creation.test.mjs desktop/tests/identity.test.cjs tests/agent-desktop.test.mjs tests/naumi-enterprise.test.mjs，53/53，exit0。
- node scripts/verify-creation-mcp.mjs：CREATION_HOST_COMPLETE checks=22 supplier_fixture=1 native_present=1 production=0，exit0。固定CLI子进程、官方MCP Client、真实作用域ToolRuntime、原native present执行器和真实Session事件；Gateway/provider为本地HTTPfixture，不重复冒称上游真实Next/PG验收。覆盖丢响应原号恢复、同号去重/变参拒绝、跨Session/账号/token/空间恢复拒绝、实际下载hash、文件变更拒绝、独立dispose与撤权。
- node desktop/scripts/verify-creation-ui.mjs：CREATION_ELECTRON_COMPLETE checks=11 OS_crypto=1 ACL=1 production=0，exit0。真实Electron生产main/preload/账号UI，真实Windows safeStorage加解密与DACL；Gateway、Backend、Installer I/O为隔离适配。覆盖错号、密钥清空、加密磁盘字节、失败轮换恢复、忙碌拒绝、退出移除临时token、双账号隔离和移除本机授权。截图已打开核对。
- 初次本地验证发现Windows PowerShell模块加载环境差异，改用系统PowerShell直接调用.NET ACL接口并读回检查；未用chmod冒充Windows保护。MCP换号测试补充显式等待真实ready，安装不是就绪。
- 卸载作用域只调用固定adapter真实async disposer；内存队列随Agent移除清理。native present通过官方NativeToolExecutor共享原审批/结果管线，不调用工具body或伪造事件。
- 当前分发不含个人token；通用网关tenant历史回执授权缺口仍在，宿主限制原绑定恢复不等于修复远程授权。

## 集中回归与交付状态
- 全仓 node --test --test-concurrency=2 tests/*.test.mjs desktop/tests/*.test.cjs：tests746/pass746/fail0，exit0，FULL.log。不调整原有时间断言；最后增加的两项宿主上传/原present权限用例另跑22项链全部通过。
- 插件AST/import与分发闭包通过；固定vendor为原字节，import adapter前外部manifest pin和每个文件hash全部检查。
- 原native present工具不会因下载成功自动执行：Agent显式调用naumi_present_download，宿主仅接受该Session真实下载回执，经过原审批管线再调用原present。原有present仍可用，不拦截其他会话。
- 本轮不修改共享3080服务、不接入个人生产令牌、不重建EXE。其他线程的0.3.6安装器草稿/快捷方式验收保持独立，不把本切片加入已经固定的安装候选。
- 副本回滚恢复10个原文件、移除15个本任务新增源文件；复跑原基线45项；实际结果以PACKAGE_RESULT.json为准。首轮回滚测试副本缺少未修改的root package与desktop/vendor元数据，已修复副本输入清单；并非产品回滚失败。
- 安装器/生产运行/真实账号授权仍需在固定main构建及授权后分别验收。源码合并不等于已安装到员工客户端；保留所有通用画布能力缺口。

## 主线同步与最终验证
- 实现提交 e86ca33；再次fetch并普通merge整合origin/main aa33222d9fda07de3314b139927854789d51b68b，整合提交8617053。唯一冲突为.gitattributes末尾追加规则，双方全部保留；没有产品源码冲突。
- 最新主线包含其他线程安装器快捷方式修复与既有验收证据，保持不变。集中整合验证 node --test tests/naumi-creation.test.mjs desktop/tests/identity.test.cjs desktop/tests/installer-ui.test.cjs tests/agent-desktop.test.mjs tests/naumi-enterprise.test.mjs → tests64/pass64/fail0，exit0。
- 本切片不改已固定的0.3.6安装候选，已向安装器线程发送公共文件归属协调；尚未部署到员工实际运行包。下一步由固定main构建新版本后完成正式账号授权与运行验收。
