# CUA 统一桌面引擎

## 模块与职责
桌面 UI 执行统一为 `naumi_cua`：固定 Cua Driver 0.54.0，Windows x64。本模块不创建第二个模型服务。原 agent-desktop 默认挂载、依赖、CLI 及技能正文已移除。浏览器、Blender、Naumi 创作仍使用自己的领域接口，不充当桌面输入兜底。

## 公共接口、依赖方向、状态归属
- `host.js → cua.js → cua-runtime.js → Cua Driver stdio`；直接模式随 stdin EOF 关闭，不注册计划任务，不改 PATH，不连接云 relay。
- 一个原生 Harness 工具 `naumi_cua`；实际复用 `createMcpToolDefinition` 的截图附件准入、持久化及模型投影。执行继续受原 NativeToolExecutor 和 EmployeeRuntimeGate 管理。
- Session 来自 `exec.agent.id`，模型不可传入 session、AX token、脚本或 DOM。Driver session 为真实 ID 的哈希标签。
- 输入锁为本机 LocalAppData/Naumi/cua/input.lock；同进程 Session 租约 120 秒，另一后端也必须拿同一文件锁。活 PID/不完整锁不抢占。死 PID 恢复使用单独原子 recovery guard。异常 recovery guard 保留为人工排查状态，不推测清理。
- 每次观察返回 PNG 原生附件、尺寸、30 秒 observationId；绑定目标窗口和租约随机号。所有输入在 native dispatch 前消耗观察号；点击额外传上游 capture_id。双击/右键统一映射为同一 click 原语（count/button），保留 capture_id。
- 每次输入后自动重新截图；结果标记 verificationRequired，模型必须观察图像判断效果。原生 dispatch 不是业务成功。
- 丢回执、取消、native isError 或后截图失败进入 UNKNOWN，无自动重放；不确定输入关闭原 transport 并等待退出，原 Session 重新观察后才可继续/释放。UNKNOWN 锁不因 idle TTL 转交给另一 Bot。
- `agent/disposed` 取消、等待当前操作、释放锁；重建同 ID 时重新 attach，历史 observation 不复用。插件 dispose 关闭自有 Driver，不停止别的进程。
- `/naumi/desktop` 只读 owner 接口：installed 与 connected/ready 分开，不因工具注册冒称完成桌面操作。

## 固定产物与发行
上游 MIT，`https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.54.0`。
- ZIP SHA256 `c0b92cb56ec7863ca177a2813bf5e22bdea5772a56f5bc4e8be064eed34498d7`
- cua-driver.exe SHA256 `99a4b7a04fb3a25a450cc64ed4b806406c18aa08f27ec83a8364a0c601b1865e`
- 下载产物实际 Authenticode = Valid，签发对象 Cua AI, Inc.；未声称验证 Sigstore。
- `desktop/scripts/stage-cua.mjs` 只在构建阶段下载，校验 ZIP pin、exe pin、Authenticode 后复制进插件。员工运行时只离线 hash 验证。runtime packaging 排除旧 agent-desktop，即使开发 node_modules 仍残留旧缓存。
- telemetry 用实测环境变量 CUA_DRIVER_RS_TELEMETRY_ENABLED=false 关闭。未装可选 perception/OmniParser、SDK DLL、全局技能链接或更新器。
- 本次 Windows x64；其他平台明确缺少打包，不回落旧引擎。

## 本次实现与迁移状态
负责人：本任务线程。基线 origin/main `301c4423715f8f5fe4988131f67bb136078cefe3`，分支 `codex/cua-unified-20261119`，独立 worktree `E:/Workspace/naumi-desktop-cua`。共享本地 main `0b9822cbf1c84574d127b3d5d4fff2608cd2e0ae` 比远端多 3 个其他任务提交，保持不变；不通过本任务顺带发布。
模块迭代 1。明确文件范围：CUA runtime/host 接线、desktop capability probe、默认技能、固定构建 stage、相关测试、依赖及本文档；不改会话、模型配置、企业密钥、UI。

## 验证与下一步
基线旧集成测试 10/10 exit0。集中测试、真实 native fixture、回滚副本及整合证据随验收更新至 evidence/cua-unified/VERIFICATION.txt。
0.4.4 的固定 runtime stage 已完成，45,636 个文件通过离线依赖闭合与隐私路径扫描，真实打包路径的 CUA stdio probe 通过，旧引擎程序不在包中。完整 NSIS、实际已安装 Desktop 更新与跨平台验收状态见交付证据后续更新；Git 或本地 native fixture 不等于产品已安装上线。

## 集中验收更新
- 新增工具经过真实 Cordis Tools/NativeToolExecutor/企业运行门：未授权调用 dispatch=0，显式 allowlist 后 dispatch=1；未触发模型请求。
- 真实 WinForms 隔离窗口点击、输入、Ctrl+A KeyDown（fixture 明确定义选全）、End、滚动和拖拽均产生 native 事件及前后 PNG；背景快捷键/滚轮得到 background_unavailable 后，测试显式重新观察并前台执行。不是通用所有应用验收。
- 实测暴露并修复：原生 schema 子集拒绝 min/max 关键字，改为 zod 执行期约束；原生 Cordis route 服务需显式 inject；PowerShell 5.1 继承 PS7 ModulePath 导致签名检查加载失败，构建 probe 已按系统模块根修正。
- CUA 截图准入失败将撤销 observation 并返回错误，不留下仅文本提示下可继续操作的 token。

## 真实旧服务升级补充
旧服务的代码同步器拒绝任意多余文件。CUA 删除了旧 agent-desktop.js 与两份旧 skill reference，实际旧服务升级 plan 因此需要显式退役，不能仅测干净安装。service-code.cjs 新增仅针对 Naumi enterprise + CUA 源文件 + 0.4.4 及以上版本的三文件 SHA256 白名单；改动过的旧代码、其他插件与未知文件继续拒绝。删除参与原代码事务、备份、崩溃恢复与回滚，版本标签最后写入。新测试覆盖成功退役、部分删除失败恢复、手改文件保护和不同插件拒绝；桌面集中回归 181/181 exit0。对真实原 0.4.3 服务仅只读计算升级计划：14 项变更、3 项精确退役、2 项既有无效备份保留。

## 正式安装与发布验收
0.4.4 从固定 main `10cf4595ac40ba7e8c6931b11a6ca7873932dbd1` 构建，安装器 SHA256 `5d0c6277c1a723d60f6699a78d6e2c5e3e22e500562f3f260041e0dbfee95514`。真实覆盖安装 exit0，实际客户端/本机服务均0.4.4；原生签名实例握手、CUA工具注册、旧默认引擎移除、完整代码对齐delta0通过。114个会话保留，121份受保护文件中120份字节相同；1份会话原有786189B全部作为原始前缀保留，原生退出/启动追加224B：取消遗留user-approval队列项、session/end-seed。原记录序号连续，未自动重放审批；没有把该会话误记为逐字节未变。Bot/任务/群组/模型API摘要未变。公开v0.4.4的manifest HTTP200与本地逐字节一致，GitHub完整安装包上传digest匹配。
浏览器连接、微信增量由各自线程负责，未装入这个冻结包；managed profile不热补新文件，后续应从含这些切片的新固定main构建完整递增版本再正常升级。
回滚默认使用本任务冻结modified快照创建独立副本，验证原始22份文件与旧10项测试；实际恢复入口仍对目标副本逐文件检查，遇到后续改动拒绝覆盖。后续并行主线不被rollback-test覆盖。
