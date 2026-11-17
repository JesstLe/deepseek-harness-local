# Blender MCP 内置与引擎策略

模块与职责：Naumi 自带标准 MCP server、Blender 侧 stdlib+bpy 桥接、引擎检测/路径选择、独立窗口启动与状态入口。复用 Harness mcp-client、官方 MCP TypeScript server SDK 与原生技能 provider，不另建 Agent/权限/聊天执行系统。
负责人：本任务主代理；分支 codex/blender-mcp-20261117；独立目录 E:/Workspace/naumi-blender-mcp。基线 main/origin/main 406277c1c6f3f892b5c2218911971927e8cef4d1，已 fetch，其他线程内容不改。

## 调研与决策
- 上游 ahujasid/blender-mcp 固定审阅提交 b6a2ce30c14636a562b5549684d9db6fc01f29ab，Python 包现名 mcp-for-blender 2.3.0；MIT。主分支完整 server/addon 含遥测、第三方素材与付费生成等依赖，本轮不全量搬入。
- 内置公共 MCP SDK 2.2.0，保留上游核心 type/params 命令语义；Blender 端采用仅 stdlib+bpy 的 Naumi 认证桥，独立会话、不写用户插件偏好，不依赖全局 uv/Python，不添加遥测/付费素材生成。
- 本机真实检测到 C:/Program Files/Blender Foundation/Blender 5.2/blender.exe，--version 返回 Blender 5.2.3 LTS。工具侧原有 Blender MCP 未连接；不复用不明已有端口，不接管用户原窗口。
- **MCP 默认内置；Blender 本体不放入主安装器。** 优先用户已有 Blender4+；缺少则提供官方 LTS 下载入口。受管可选引擎下载/安装是后续独立组件，不伪装成本轮已有功能。本机引擎目录实测 945,021,611 bytes（约901MiB、6524文件）；这是安装目录体积而非压缩下载体积。避免主包体积、双版本、升级频率、显卡驱动与引擎再分发维护耦合。

## 公共接口、依赖方向、数据/状态/事务归属
- /naumi/blender 为 owner-only + same-origin 严格 API；读取检测结果；显式选择路径/启动/断开。所有者未启动时不自动打开窗口。
- MCP namespace naumi_blender：blender_status、get_scene_info、get_object_info、execute_blender_code、operation_status、render_preview，共6个基础工具；注解区分读写，沿用原工具审批。
- BlenderRuntime 选择已安装版本；--factory-startup 新建独立窗口，不改用户其他 Blender 进程、现有工程或偏好。MCP进程退出不终止 Blender，断开只关闭桥接保留GUI场景。
- profile home/naumi/blender 独立配置及运行回执；随机127.0.0.1端口、每次实例随机密钥、双向HMAC+实例和请求标识校验。密钥不进入UI/API、模型或Git。
- bpy只在Blender主线程执行；写操作先落持久回执，稳定UUID去重，跨实例拒绝假成功；超时记UNKNOWN，查询operation_status，不盲重放。任意Python不冒充沙箱，适用现有工具授权。
- render_preview 返回真实 PNG，恢复原渲染设置；最终.blend/导出/图片仍走原任务工作区和present交付。

## 实现与迁移状态
核心切片已实现并通过本地集中验证。范围：blender*.js、blender-bridge、blender-skills、assets/blender-settings.*、host/client最小入口、package/lock依赖、验证、本文档。无Blender安装器、企业账号和模型路由变更。

## 验证与证据层级
基线 node --test tests/agent-desktop.test.mjs tests/naumi-enterprise.test.mjs → tests24/pass24/fail0，exit0。
- 模块：node --test tests/blender-mcp.test.mjs tests/agent-desktop.test.mjs tests/naumi-enterprise.test.mjs → tests36/pass36/fail0，exit0。覆盖缺引擎、路径CAS、坏回包、丢失响应、并发启动、忙碌实例不重复开窗、owner/same-origin和包依赖。
- 真实引擎：node scripts/verify-blender-mcp.mjs → BLENDER_REAL_COMPLETE checks=14 model_calls=0 user_scenes=UNTOUCHED，exit0。隔离profile启动真实Blender 5.2.3 LTS背景进程，经官方SDK与Harness MCP client读取场景、创建球体、保存.blend、UUID去重/冲突、持久回执、PNG、取消等待后查询及dispose注销。不是模型自主决策验收；不触碰用户原场景。
- 原生HTTP/UI：node scripts/verify-blender-ui.mjs → BLENDER_UI_COMPLETE checks=15 errors=0 model_calls=0，exit0。真实独立Harness profile；检测真实安装版本，保存临时配置，1360/580/360响应式，截图已打开检查；检测状态不误显示启动。
- 全量：首次默认并发 tests679/pass678/fail1，原有naumi-async-bot的1000ms等待断言在高并发负载返回running（保留FULL.log）；未改该测试/产品。限制并发 node --test --test-concurrency=4 tests/*.test.mjs desktop/tests/*.test.cjs → tests680/pass680/fail0，exit0（FULL_FINAL.log）。
- npm pack --dry-run --json ./plugins/naumi-enterprise + node scripts/audit-enterprise-package.mjs：143文件、AST/外部依赖闭包通过。server SDK 2.2.0是正式runtime dependency，插件声明exact peer；不依赖全局Python/uv。
- 初次真实测试误把native MCP抛错当作error result，已只修测试expectation；REAL_INITIAL.log保留。
- 证据与副本回滚：evidence/blender-mcp/；脚本scripts/package-blender-mcp.mjs生成源码快照、补丁、保留原始字节和SHA256，ROLLBACK.sh只接受显式标记副本，先全量验hash再恢复；副本复跑基线24测试，主源码保持修改。

## 未完成与下一步
主线/当前运行入口收尾中。未做：Blender受管下载器、引擎默认打包、上游付费素材/生成服务、模型驱动的复杂建模验收；完整EXE安装器未重建。已完成基础工具切片，迭代计数1。

## 主线同步与运行加载
- 同步前406277c1c6f3f892b5c2218911971927e8cef4d1；2026-11-17再次fetch并fast-forward整合origin/main ba4ee2a182e3dd8d4a4ddc5160b193fc987af8cd，代码无冲突；新增主线内容为其他任务文档/证据，保持不变。
- 部署脚本仅从main读取固定源文件，对已安装host/client/package作增量拼接，保留运行目录私有扩展和其他插件；重启前检查全部sessions、独立Bot任务和群聊回复均空闲。SDK仅新增server@2.2.0，沿用已有core/zod。
- Git合并不等于实际加载；后续DEPLOYMENT.json和LIVE_UI.json分别记录当前HTTP/native工具注册、真实界面与运行源码hash。
