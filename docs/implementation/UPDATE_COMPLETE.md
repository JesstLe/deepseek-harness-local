# 客户端更新闭环修复

## 模块与职责
- 本任务 `codex/update-complete-20261118`，独立工作区 `E:/Workspace/naumi-update-complete-20261118`。
- 基线 main/origin main `72e11b6a286bba8e11db90a0edeb32653301a52e`。用户要求一次性修复、发版并处理当前安装。
- 范围：desktop更新门禁/退出生命周期、preload版本事实、原生更新UI/产品版本显示、定向测试与真实更新runner、0.3.9版本/发布记录。共享3080、模型/员工/企业数据不迁移。

## 接口与状态归属
- 更新仍由electron-updater与标准NSIS执行；不新建安装器、不绕过任务/维护准入。
- owned isolated后端继续签名quiesce与精确停止。显式external链接只读核对会话/任务，冻结本窗口准入，不停止或替换共享后端。
- 共享原生quit gate的prepare阶段在启动安装器前完成flush/bridge/owned worker退出；第二次before-quit直接退出，不与安装器抢旧进程。
- Native版本由主进程app.getVersion通过BrowserWindow additionalArguments传入preload不可变字段；服务版本仍来自当前页面backend配置。两者分开显示，不改backend-link。
- 单连接下载失败保留错误并轮换默认源，不用busy冒充未知状态；UI展示安装准备阶段和明确失败。

## 基线与现场
- installed app.asar=0.3.7，backend-link指E:/Workspace/naumi-desktop，3080 PID46840自09:38:57未变；0.3.8更新包完整在cache。
- 实际安装源码隔离复现：legacy gate INSTALL_ACTIVITY_UNKNOWN→UPDATE_INSTALL_BUSY；quitAndInstall=0，backend维护调用0。主线有同样代码。
- 基线原模块73/73，exit0（不存在的旧UI测试文件不会计入）；后续集中验收使用实际文件清单。

## 验证与未完成
- 完整切片后集中测试；新增外部连接失败/忙碌/空闲、并发/重试、异步flush先于安装、版本指向和默认源轮换。
- 必须补真实Electron原生更新交接及NSIS退出→重开证据，不以人工安装或mock quitAndInstall代替自动更新证明。
- 完成固定main构建0.3.9后，保留原版本资产、数据与可逆证据，处理当前安装。当前尚未宣称修复或发布完成。

## 主线整合
- 已整合 origin/main effb693b6a7ba8a8067120c3a8566eae3f61b6bc，保留交付中心/折叠侧栏全部UI与证据；.gitattributes只并列保留两模块规则。
- 整合树集中测试843/843，exit0，含最终原生启动回执；原切片837/837。
- 新增实际原生自动更新runner：独立currentuser安装槽、公版0.3.8加修复候选代码（保留旧版本元数据），下载完整0.3.9真实NSIS，验证旧PID退出/新PID回执/外部后端与原会话保留，最终卸载fixture；该验收尚待构建后执行。

## 真实交接首轮与追加修复
- 首轮真实loopback完整下载及原生点击已执行，旧候选GUI退出，但HKCU/HKLM并存时stock静默分支仅凭hasPerMachineInstallation就转机器安装，新GUI未重开。首轮保留HANDOFF_FIRST，不混记通过。
- 最小扩展：native updater公共installDirectory绑定process.execPath目录；NSIS现有customInit仅针对--updated且显式/D匹配已注册安装目录，选择对应现有安装范围，未知目录exit43；未修改stock引擎/卸载事务/依赖版本。
- 追加修复后定向100/100通过，exit0。需从包含修订的固定main重建0.3.9并复跑真实交接。
