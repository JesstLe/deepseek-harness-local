# IM 网关：钉钉与飞书

## 模块与职责
负责人：本任务主代理；工作区 `E:/Workspace/naumi-im-gateway`，分支 `codex/im-gateway-20261117`。
基线 main/origin/main：`e620bd982b77bac92d2dc820c83ae2255658d682`；2026-11-17 已 fetch。共享 checkout 其他任务内容保持原状。

网关只负责外部消息 I/O，不创建第二套 Agent、输入器或任务系统。首批钉钉 Stream、飞书/Lark 长连接；复用 DS-Bot 适配器，固定源提交 `5e9b7da8882da3b68d8a0624342708c2150a9156`，保留 Apache-2.0 LICENSE、NOTICE 和来源哈希。

## 公共接口、依赖方向、数据与事务归属
- `im-store.js`：独立 SQLite 账本，连接配置仅存凭据引用；配对码只存摘要，10 分钟有效、单次消费；绑定版本、inbox、outbox 持久化。
- `im-service.js`：所有者命令、连接生命周期、适配器状态；外部事件先持久化，再执行原生 Bot runtime/group service。
- Bot 私聊：每条外部绑定拥有独立 Session，以目标 Bot 的原生 profile 创建；不改 Bot 首页会话。
- 群聊：显式绑定已有本地群，复用原生 post/interrupt/readPost；仅外部输入对应的回复回外部，网页消息不广播。
- `im-delivery.js`：分片独立出站，UNKNOWN 不自动重发；不为补发结果重新执行模型。仅原始绑定有效版本能发送。
- 凭据归 `ctx.credentials`；UI 只能读 configured，不读 secret/ref。配置通过 revision CAS，启停后旧回调失效。
- 任务来源以原账本 `intent.source.messageId`/父任务映射识别，不靠最近会话猜测。
- 审批/问题使用 Agent 作用域公共 waterfall；只认原外部用户和原绑定，审批只允许单次，撤销/结束后按钮失效。

## 本次实现与迁移状态
首批实现已完成，正在整合与运行核验。明确文件范围：新增 im-*、assets/im-settings.*、third-party/ds-bot-im、tests/naumi-im-*；bots、bot-groups、bot-group-service/store、host、client、package 仅公共挂接与资源入口。原导航、输入器、模型位置和员工钉钉工具保持。

## 验证命令、结果与证据层级
基线：`node --test tests/naumi-bots.test.mjs tests/naumi-bot-groups.test.mjs tests/naumi-bot-groups-http.test.mjs tests/naumi-bot-runtime.test.mjs` → 38 tests / 38 pass / 0 fail，exit 0。记录 `E:/tmp/naumi-im-gateway-20261117/BASELINE.log`。
集中验证：全仓 `node --test tests/*.test.mjs desktop/tests/*.test.cjs` 619/619，exit 0；其中 IM 初轮新增 20 项覆盖真实原生 Session/runtime、真实上游协议驱动和本地持久化，平台服务为受控响应。真实隔离 Harness + 浏览器 15 项通过，0 page errors，0 model calls。首次 UI 脚本误用桌面快捷键，修正为网页 Ctrl+Alt+,，保留初始失败记录。迭代计数 3（网关路由/交互、双平台协议与文件、设置 UI），已 fetch origin/main，已整合 `541830103b4cd2782a3f8621f012c625932c95d1`，整合后 SHA `80402a972c4b8053a76d1430a3c46c02800d7016`，仅 `.gitattributes` 同尾追加冲突，保留双方规则。

## 未完成项与下一步
主线整合、副本回滚和实际运行入口的最终结果见 [本次交付记录](../changes/2026-11-17-im-gateway.md)。真实外部账号未配置；本地受控协议验收不等于真实平台收发验收。首版不实现企业通讯录同步、全量历史同步和音视频通话。


## 平台配置与使用
1. 钉钉：企业内部应用启用机器人和 Stream 接收模式，授予机器人发送与媒体能力，发布并设置可用范围。设置页填 Client ID / Client Secret。
2. 飞书/Lark：自建应用启用 Bot；事件订阅选择长连接，订阅 `im.message.receive_v1`、卡片交互 `card.action.trigger`；按实际使用申请 `im:message:send_as_bot`、`im:message.p2p_msg:readonly`、`im:message.group_at_msg:readonly`、`im:resource` 等权限，发布并设置可用范围。国际版选择 Lark。
3. 设置 → 消息接入 → 添加连接。保存不自动启用；验证通过后显式启用，选择私聊 Bot 或已有群，生成配对码。
4. 在目标机器人私聊发送 `/pair CODE`；群内需 @机器人。配对人默认是唯一授权成员；所有者通过“成员”逐项添加真实平台用户 ID。
5. 普通消息复用原生 Agent；`/stop` 精确停止当前聊天回复，不取消后台独立任务。审批允许一次/拒绝，提问支持 `/answer TOKEN 答案1 | 答案2`，编号多选用逗号。
6. 发送超时或崩溃中的发送记 UNKNOWN，不自动重放。所有者在待核对回执中确认已收到，或明确未收到后补发；补发不执行模型。

## 首批边界与已知缺口
- 支持文本、飞书入站图片（单资源 5 MiB）、原生交付文件出站（10 MiB 以内且版本/事件凭据匹配）。钉钉入站图片/富文本/通用文件、语音、音视频和飞书线程暂不进入模型，不伪装为已处理文本。
- 外部线程字段明确拦截，首版按平台应用 + 根聊天隔离，不把线程混入根会话；后续补线程原路回复接口后再开放。
- 上游协议返回句柄立即启动长连接；保留重连/心跳实现。Feishu 分片缓存上限64个、单消息128片、60秒有效，组装并持久化后统一 ACK。
- 解绑/成员变更提升绑定 revision，旧出站目的地撤销；重新配对创建新 Session，历史 Session 的 Bot 归属以独立 tombstone 表保留。
- 审批/问题只走原生 Agent waterfall，外部按钮为短时单次 token；绑定、原会话、账号、聊天、发起人和生命周期同时核验；重启后旧按钮失效，审批不自动恢复授权。
- Inbox 到 50,000 条后停止新准入而非删除去重凭据；归档/保留策略、连接物理删除与撤回远端消息留待下一模块。停用保留绑定与审计，不删除业务会话。
- 源码回滚只恢复代码；不降级/清空真实 SQLite、凭据、Sessions 或任务数据。线上停用、来源日志、平台回执核对仍是独立验收项。

## 可复用实现检查提示
```text
在 naumi-desktop 的 IM 网关上增加一个平台：先阅读 docs/implementation/IM_GATEWAY.md，
复用 IMStore/IMService 和既有 Bot runtime/group service，仅实现 check/connect/sendFile 适配契约。
默认停用；不新增 Agent 引擎、输入器或密钥库。测试先持久化后 ACK、同消息去重、
绑定 revision 失效、原聊天原发起人交互授权、UNKNOWN 不盲重放，以及原有会话不回归。
记录真实平台与受控协议验证的证据层级，禁止将受控响应记为真实账号收发验收。
```

恢复边界补测后 IM 定向22/22通过。初次新增丢收据测试误断言中间必须停在 dispatching；网关已在同轮 kick 完成幂等重试，改为验证一次 native 投递及最终 accepted，不改变实现掩盖问题。
