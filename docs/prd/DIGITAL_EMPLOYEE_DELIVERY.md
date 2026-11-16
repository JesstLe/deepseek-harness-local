# 数字员工实施追踪

更新时间：2026-11-16。PRD：`NAUMI_DIGITAL_EMPLOYEE_PRD.md`。实施模型：GPT-6.1 Sol。

| 阶段 | 内容 | 当前状态 | 证据/剩余 |
| --- | --- | --- | --- |
| 基础 | Bot 身份、创建修复、跨 Bot 派单回传 | 已实现，本地实际模型链路验证 | `1d6a758`，`evidence/bot-communication` |
| PRD | 全量需求、架构边界、验收矩阵与阶段 | v1.0 已完成 | `NAUMI_DIGITAL_EMPLOYEE_PRD.md` |
| M1 | 本地档案、记忆、动态设定、巡检 | 本地基础模块已实现并接入 | SQLite/owner HTTP/Agent 工具/事件/注入/心跳；156 项测试通过；真实跨会话记忆验证；详见下表 |
| M2 | 员工管理 UI、目标、交付与验收 | 未实现 | 不以 API 代替 UI 验收 |
| M3 | 企业组织、同步、离线授权 | 未实现 | 需服务端实现与实际部署 |
| M4 | 主动规则、预算、分布式执行与故障切换 | 未实现 | 需模型网关、租约与故障注入 |
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
