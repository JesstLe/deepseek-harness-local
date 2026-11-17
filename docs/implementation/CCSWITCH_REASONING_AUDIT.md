# CC Switch 模型复核与推理档位

日期：2026-11-17。负责人：当前任务；基线 541830103b4cd2782a3f8621f012c625932c95d1；分支 codex/ccswitch-reasoning-audit-20261117；独立 worktree E:/Workspace/naumi-model-reasoning-audit。首次同步主线 e16b369。功能迭代 1。

## 模块与职责
只读复核 CC Switch 来源、当前桌面绑定的实际 3080 后端，补齐模型连接配置和原生推理档位。凭据值不进入证据、Git 或日志。当前 18 个来源、8 个已导入分组、38 个模型；8 组密钥匹配，38 条原生目录均缺 reasoning。10 条路由各做一次原生小请求，6 条成功；对 4 条失败再定向检查一次，Kimi/open 配额错误，OpenCode/LAN 仍失败，保留原连接，不因模型列表 401/404 删除可用推理路由。

## 公共接口、依赖方向、数据/状态/事务归属
复用原 ModelConnections、settings 原始配置/CAS、credentials、PiAiAdapter、原生输入器旁模型/推理选择器和 Session 模型选择持久化。官方能力目录仅提供精确 ID 推荐；供应商代理支持与官方规格分开验收。未知别名保留，不按名字猜能力。

原生缺口：添加包含 off 的能力映射时，无指定档位会被 pi-ai 当作显式关闭。增加 opt-in preserveReasoningDefault，仅在已声明能力且未指定档位时，把 dispatch 副本的 off 设为 null；目录仍公开真实 off 能力，显式关闭仍发送 none/disabled。扩展脚本固定原始 SHA、原子替换、原始备份，sync 和打包共用；未启用路由不改变。

## 本次实现与迁移状态
已实现。模型连接页增加每模型官方/继承/关闭/自定义能力与协议模式，连接默认档位仅接受所有模型共有能力。继续复用原生选择器，不新增第二个发送区或全局拦截。预算、默认模型、凭据、会话消息、后台任务不随能力导入改变。

## 验证命令、结果及证据层级
基线 node --test tests/naumi-model-connections.test.mjs tests/naumi-model-specs.test.mjs tests/naumi-model-discovery.test.mjs：44/44。来源只读审计、模型列表和真实路由样例见 evidence/ccswitch-reasoning-audit；不是每模型全量可用证明。定向 57/57；真实固定版适配器 mock wire 覆盖三协议的默认/off/low/high/xhigh/max 与错误档位；设置 HTTP/CAS、原生目录、设置 UI、两 Bot 的 Session 档位隔离/重开持久化共 20 项通过，pageErrors=0、supplierCalls=0；原生 model/selection 压缩日志真实写入。副本回滚恢复 8 个原文件、移除 15 个新增文件，原基线 44/44 再次通过，工作副本保持修改。

## 未完成项与下一步
待主线整合后的全量验证、实际后端配置增量和运行接入。运行门禁在准备/迁移/验收时重复核验，不打断正在运行的对话。安装包本次不重建。

## 当前来源与真实供应商复核
- 18 条来源配置的内容 SHA256 全部与审计前一致；CC Switch 只读。8 组凭据匹配；不修改默认模型、不替换密钥。
- 6 个非配额异常分组逐模型验证 16/16 有效。7 条先验证指定推理档位，其余 9 条追加验证；供应商接受请求和本地精确 wire 字段验收分开，不声称代理公开其内部映射。
- Kimi Coding（3条）和 open（19条）分别在路由样例与定向复测中返回配额错误；22 条不做重复逐模型扣费探测，原组保留。OpenCode Go 缺少 x-opencode-session 时先拒绝，补齐会话头后明确返回 api_key_expired；LAN 反代网络断开，均不新增无效连接。
- OMP tdh 三个遗漏 ID（gpt-5.5、gpt-5.3-codex、gpt-5.3-codex-spark）不在该账号当前返回的 20 条模型目录中；不把陈旧来源写入当前可用目录。Claude 来源的 [1M] 型号在目录中只有 canonical ID，保留现有 canonical ID 和上下文预算，不盲目添加括号作为 wire ID。
- 官方 OAuth/无 key 来源与当前 API-key 路由分开处理，Hermes 缺环境密钥不复制。目录的 401/404 不等于推理失效，experientiallabs 和 DeepSeek 的有效路由保留。
- 官方精确 ID 能力匹配 27/38；11 条旧型号/别名不猜测。Kimi Overview 与 Model Configuration 对默认档位存在差异，保存两份资料，较具体页面确认 K3.1 Pro 支持 low/high/max；本实现不强填任何默认档位，保持供应商默认。

## 复现与回滚
```powershell
node scripts/audit-ccswitch-models.mjs
node scripts/probe-ccswitch-models.mjs
node scripts/probe-reasoning-models.mjs
node scripts/probe-reasoning-models.mjs --remaining
node scripts/verify-reasoning-ui.mjs
node scripts/package-reasoning-audit.mjs a4c89c3
```
前三类供应商探测会产生小额真实请求；审计与 UI 本身不发供应商推理。ROLLBACK.sh 仅接受带 .naumi-reasoning-copy 标记且不含 .git 的单独副本；先核对全部修改与原件 hash，再恢复。运行配置私有原件与修改件由部署脚本单独保存在 .dsh 下，不加入公共证据。

测试期间发现并修复自定义档位 schema 的稀疏 Record 问题，增加回归；Windows worktree junction 的 import.meta.main 检查偶发未执行入口，夹具改为显式调用原 CLI 的 runCli，并复制单个原生适配器包后扩展，不改共享依赖。空白 Session 即使改名也不以该标题显示，原生 UI 验收改用正式 Bot/home Session 入口，而不是创建消息或修改原生导航规则。

主线同步：5418301 → e16b369 → a4c89c3，集成提交 944eb18；只将 .gitattributes 两个独立证据段合并并保留 package 的并行新增项。集中全量 node --test tests/*.test.mjs desktop/tests/*.test.cjs：668/668、exit 0；包闭包 132 文件 PASS。功能迭代仍为 1。
