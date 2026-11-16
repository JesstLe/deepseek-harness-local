# 数字员工实施追踪

更新时间：2026-11-16。PRD：`NAUMI_DIGITAL_EMPLOYEE_PRD.md`。实施模型：GPT-6.1 Sol。

| 阶段 | 内容 | 当前状态 | 证据/剩余 |
| --- | --- | --- | --- |
| 基础 | Bot 身份、创建修复、跨 Bot 派单回传 | 已实现，本地实际模型链路验证 | `1d6a758`，`evidence/bot-communication` |
| PRD | 全量需求、架构边界、验收矩阵与阶段 | v1.0 已完成 | `NAUMI_DIGITAL_EMPLOYEE_PRD.md` |
| M1 | 本地档案、记忆、动态设定、巡检 | 本地基础模块已实现并接入 | SQLite/owner HTTP/Agent 工具/事件/注入/心跳；156 项测试通过；真实跨会话记忆验证；详见下表 |
| M2 | 员工管理 UI、目标、交付与验收 | 已实现并接入本地；M3 企业权威待接 | 166 项回归；20 项真实壳/SQLite 交互检查；实际本地页面和刷新恢复通过；文本交付版本与本机 owner 验收 |
| M3 | 企业组织、同步、离线授权与原生企业交付 | 已接入本地企业服务；保持远程生产/员工验收独立 | 214 企业端/178 Harness；13 UI 交互；真实原生任务/私有下载/独立验收、回执与回滚；详见 ENTERPRISE_WORK_BRIDGE.md |
| M4 | 主动规则、预算、分布式执行与故障切换 | 执行归属模块已接入，其余继续 | 具体设备绑定/持久化 attempt/fence/租约/UNKNOWN、223 企业端/183 Harness/18 UI 与真实双设备故障；能力/规则/运行门/模型网关/预算待续 |
| M5 | 开箱即用员工安装包 | 待后续功能集成后重建 | 不复用旧 EXE 冒充新功能包 |

## 本轮实现日志

1. 核对干净修复工作树 `E:/Workspace/naumi-bot-lifecycle-fix`，基线 `290fea0`，不覆盖其他工作树改动。
2. 本轮新增 SQLite 员工数据层；现有 Bot/任务 JSON 与 Session 保留。
3. 本轮只更新与员工连续性有关的插件文件；不全量 sync，不改模型/业务登录/UI。
4. 三个实现模块：employee-store.js、employee-service.js、employees.js；新增独立 SQLite WAL。
5. 基础心跳为观察器，不做自主业务操作；确定性显式偏好自动学习，模型推断只留候选。
6. 全仓测试 156/156；实际模型跨会话调用 employee_memory_search 验证通过；固定测试记忆删除、会话归档。
7. 服务端同步、离线授权、前端管理 UI、主动规则、安装 EXE 均保持后续阶段，不以 M1 通过关闭整个产品目标。

## M1 验收证据矩阵

| Case | 状态/层级 | 证据 |
| --- | --- | --- |
| AC-01 | SQLite 重开与独立 Node 进程读取通过 | naumi-employee-store.test.mjs |
| AC-02 | 幂等/CAS/双连接冲突通过 | 同上 |
| AC-03~05 | 字段锁、学习开关、明确学习、历史恢复通过 | store + employees 测试 |
| AC-06 | user 来源/quote/Bot 校验通过 | naumi-employees.test.mjs |
| AC-07~09 | 记忆管理、中文检索、隔离、过期、删除与转义上限通过 | store + employees 测试 |
| AC-10 | 心跳失效检测、0 LLM、卸载与异常通过 | naumi-employees.test.mjs |
| AC-11 | 真实 HTTP CRUD/拒绝路径通过 | 同上 |
| AC-12 | 现有核心与桌面策略回归通过 | evidence/employee-foundation/full-tests.log |
| AC-13 | 本地组件不依赖远端请求；实际跨会话记忆通过 | verify-employee-foundation + LIVE_VERIFICATION.json；企业授权/服务器断网实验属 M3/M4 |
| AC-14 | 注入写失败、未知 schema/损坏库、hash 回滚通过 | store 测试 + ROLLBACK.log |

当前 M1 已完成的是单机 local-owner 连续性基础，不宣称企业共享、端到端离线授权或多设备完整验收。

## 下次接续入口

按 PRD 需求 ID 与验收编号更新状态；任何局部通过不关闭整个 M1/M2 或服务端上线目标。

## M2 进度

- 实现：员工中心四个可操作页面、人物设定差异与恢复、记忆搜索/类别/分页/审核/有效期/删除、目标与依赖、文本交付不可变版本、逐项验收和复盘候选。
- API：owner CRUD/下载；Agent 只可提交自己的交付，不可自审；executionStatus 与 businessStatus 分离。
- 证据：`evidence/employee-center/module-tests.log`、`UI_VERIFICATION.json`、`LIVE_UI_VERIFICATION.json`、`VERIFICATION.txt`。
- 界面验证为真实 Harness 壳 + 隔离 SQLite/HTTP 工作数据；实际运行版另做只读页面/接口核对，未造真实员工业务数据。
- M2 交付物目前为文本正文。企业图片/视频资产系统及组织审批权威将在 M3 集成；不把 local-owner 验收说成服务器已批准。
- 总目标 active。M3 已核对实际 3112 进程，复用 naumi-design-ops 现有 Actor/withTenant/项目授权；旧 naumi-co 只读。核心同步已实现，详细接续见 EMPLOYEE_SYNC_M3.md。

## M3 核心进度

已接入员工/设备分离权限、Ed25519 签名授权、显式私人同步、共享提案/人工审批、CAS 冲突/tombstone、DPAPI 与加密缓存、企业页。实际现有设备未登记，未自动上传。206/206 企业端、166/166 Harness、5 项隔离真实栈 UI、实际 Next.js test 企业协议和只读已部署界面通过。MEM-007 与企业工作/资产权威衔接仍未退出，M4/M5 待推进。

## MEM-007 整理模块

确定性预览、精确来源合并、确认过期清理、JSON 预览/去重/候选导入、同步来源链已实现并接入；172 项 Harness、206 项企业端、8 项浏览器操作及实际只读维护页通过。企业工作权威、M4/M5 继续推进，整体验收未关闭。

## 企业工作权威衔接

已接入原任务领取、受权限约束的私有素材上传、不可变交稿版本、独立审核验收读取和 UNKNOWN 业务回执。设备和 Agent 不授予审批权限；本地文本交付保持 local-owner。178/214 项完整回归、13 UI 交互、实际 Next.js 原命令与私有下载、实际 Harness 只读验证通过。下一 M4/M5，整体验收仍 active。

## M4 执行归属进度

已实现并部署 local/cloud 具体设备资源绑定、portable-exclusive、持久化 attempt、单调 fence、提交前后租约校验、UNKNOWN 冻结和 owner 停止核对。租约过期不清 owner、不自动接管；实际两设备/旧 fence/上传到期回滚已验证。223 企业端、183 Harness、18 UI 通过。任意本机工具/第三方副作用的全局门、能力与主动规则、预算/独立模型通道及 M5 仍在总目标内，未标完整完成。

## M4 能力与主动规则模块

已实现能力矩阵（安装/连接/授权/健康/时间独立）、实际产物事件进展、Agent等待/故障报告、owner明确启用的工作窗口/冷却/累计上限规则、原子本地通知/待办入队。详见 `EMPLOYEE_ACTIVITY_M4.md`。本轮验收和实际部署记录见 `evidence/proactive-runtime`；这不等于AI主动执行或M4/M5整体完成。全局运行门、权威预算、独立模型通道、受控AI执行与全新员工安装验收继续。

## M4 受管执行准入增量

已接入真实Agent步骤/模型流/单调工具guard、持久化root/团队/fork继承、原生逐工具执行器、精确租约续租、有效签名授权下local_only和在途UNKNOWN恢复。212全仓回归、8 UI、真实SIGKILL与20项副本回滚通过；10插件文件实际3080增量接入，真实受管绑定0、未自动登记/上传/推理。详见 EMPLOYEE_RUNTIME_GATE_M4.md 与 evidence/runtime-gate。普通会话原模型/权限/执行器保持；权威预算、独立模型通道、受控AI主动工作、M5继续，总目标active。

## M4 企业模型与预算

新增独立模型服务、签名短期设备通道、四级权威预算、真实usage结算、UNKNOWN预留保留与负责人停止核对、原PiAiAdapter和原模型位置接入。模块记录 EMPLOYEE_MODEL_GATEWAY_M4.md；证据 evidence/model-gateway。真实路由、员工启用与调用仍单独验收，不等于M4或M5整体完成。
