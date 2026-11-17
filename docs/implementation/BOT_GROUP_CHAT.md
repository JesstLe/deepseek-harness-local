# Bot 群聊

负责人：本次群聊切片。任务分支：`codex/bot-groups`。本地开工基线：`9a730ed23356d783b494cd6a45e566b08bd36605`。起始共享工作树干净。功能切片计数 1。

## 模块与职责

- 群聊入口允许本机 owner 从当前 Bot 目录选 2 至 12 个活跃成员，默认接话者可留空或从成员中选一位。任意名称的 Bot 按稳定 ID 路由。用户可输入 `@名称`，也可用点名按钮选择多个成员。
- `bot-group-store.js` 保存群、群成员 Session、消息和待处理回复。`bot-group-service.js` 负责路由、恢复和群任务投影。`bot-groups.js` 接入本机同源 owner HTTP 和 Harness 会话事件。
- `bots.js` 解析群成员 Session 的 Bot 身份。群 Session 不追加到 Bot 目录的接待 Session 列表，也不能被普通目录绑定或用于另建 Bot。
- `assets/bot-groups.js` 与 `assets/bot-groups.css` 显示群与任务。`client.js` 注册入口，`host.js` 提供静态资源，插件清单随代码同步。

## 接口与状态

- `GET /naumi/bot-groups` 列群，`GET /naumi/bot-groups?roomId=…&before=…` 读取消息与群任务。`POST /naumi/bot-groups` 接受 `create` 和 `post`。写操作使用 UUID 在网络重试时去重，同 UUID 换内容返回冲突。写入要求 owner 与 `x-naumi-bot-groups: 1`，校验请求来源和大小。
- `bot-groups.sqlite` 与原 Bot 目录同目录。群消息与点名接收人的队列同事务写入。Harness Session 收据是每轮是否真实完成的依据。重开时只恢复原来已在 inbox 等待的稳定消息 ID，无法确认是否完成的回合标为中断。
- 每位成员每个群拥有独立根 Session。运行时使用目标 Bot 自身的模型、工作目录、preset 与权限。不同成员可并行接话，单成员同群依序接话。群默认接话者只影响路由。
- 群里用现有 `bot_dispatch` 派单。群任务由原任务账本按来源 Session 投影，文件仍通过 Harness 原生交付引用打开，群聊不会写第二份任务状态。显示的任务范围是从当前群成员 Session 发起的任务。
- 群聊按本机 owner 作用域设计。成员上下文只加载当前群的近期讨论，成员仍使用该 Bot 的正常记忆、工具与权限。其他设备和企业成员的共享访问尚未接入。需要原生工具确认的轮次提供打开 Session 的入口。

## 验证与交接

- `node --test tests/naumi-bot-groups.test.mjs` 通过 6 项。使用真实 SQLite、确定性 Harness 适配器，验证点名解析、可选默认接话者、越界拒绝、并行与串行、改名与归档、重启恢复与任务/文件投影。
- 相关 JS 通过 `node --check`，`npm pack --dry-run --json ./plugins/naumi-enterprise` 确认新增模块及样式进入插件包。
- `node --test tests/naumi-bots.test.mjs tests/naumi-async-bot.test.mjs tests/naumi-bot-http-runtime.test.mjs` 未进入用例，当前环境缺少 Cordis、Harness 和 Zod，npm 注册表连接也不可用。真实 Harness 模型运行、浏览器操作与安装版验收待补。
- 原 checkout 的 Git 元数据不可写，单独 checkout 用于实现。`git fetch origin main` 在隔离 checkout 遭遇 GitHub 连接失败。通过 GitHub 读取主线 `68b4bb462fd2d3df04524f4097b723b60933bb5c` 源码，三方核对 `bots.js` 与 `host.js` 的重叠改动。

### 第二轮验收

- 群聊范围新增 HTTP 回归与浏览器验证脚本。创建群聊表单的「默认接话者」采用独立的标签和控件关联。此轮为验收和入口修复，不新增功能迭代计数。
- `node --test tests/naumi-bot-groups.test.mjs tests/naumi-bot-groups-http.test.mjs` 通过 8 项。HTTP 测试直接调用生产请求处理器，使用真实 Zod 和 SQLite。请求流和身份准入由测试夹具提供，覆盖 owner、同源、字段校验、请求上限、重试去重、独立 Session 与任务回执。
- `node scripts/verify-bot-groups-ui.mjs <node_modules路径>` 通过。使用 Chrome、真实 React、生产导航注册与群聊页面，浏览器请求转交生产处理器。验证 1280px 与 400px 下的建群、选择默认接话者、同时点名两位成员、刷新保留消息、打开任务和传递文件资源地址。Harness 布局服务、模型回复和任务账本为夹具，文件内容读取仍需在真实安装版验证。依赖目录应包含 Playwright、React、React DOM 和 esbuild。
- 验证基线为主线 `b3868edac97afde49a03dabd45caf62db1007849`。与主线有重叠的 `client.js`、`host.js`、插件 `package.json` 同时保留产品标识、会话压缩依赖与群聊入口和打包条目，合并候选复跑通过。同步到 `e63e1d382739c3046eb99549d77284bb15863a05`，其间只有验收证据文件变动。
- 真实 Harness、安装版和实际模型回合的验收仍待执行。本机缺少固定版本的 `@deepseek-ai/dsh` 与 Cordis，锁文件的离线安装因缓存缺包失败，Node 本机 HTTP 连接也受当前环境限制。此轮测试使用本机已有的 Zod `4.6.6`。待可启动后，用两只实际 Bot 验证回复、任务文件内容及重开恢复，再执行主线整合。

### 长会话续接

- 负责人为本次续接切片，独立分支 `codex/bot-group-history`。远端群聊基线 `7cc691069b459752111b369b3a4afd750fdba29e`，主线核对 `e17dc652dbc39ec2420cc092863b30fbbb35e3be`。改动范围为群上下文服务、SQLite 群存储、定向测试和本文档。功能切片计数新增 1。
- 每轮保留最近 8 条作为基础上下文。通过当前请求的关键词、引号里的短语和明确的 `#消息编号` 检索更早群消息，每轮最多附加 4 条原文证据。用户文本和已完成的 Bot 回复都能命中。显式编号优先，关键词命中率和较新的消息作为后续排序依据。
- 搜索根据当前 Session 绑定的群 ID 与当前轮次编号限界。输出保留原消息序号，每段最多 600 字符，截取时标明是片段。群原文和回执仍以 SQLite 为准，沿用现有表和索引，无数据迁移和额外模型调用。
- `node --test tests/naumi-bot-groups.test.mjs tests/naumi-bot-groups-http.test.mjs` 通过 10 项，覆盖长群聊重开后召回、原话、引用、未来轮次排除、群隔离和条目上限。Chrome 群聊回归通过，覆盖原有入口、点名、刷新和任务交付导航。
- 用浏览器确认固定版本在 npm 注册表可用，Naumi `v0.3.2` 发行包的浏览器下载超时。真实模型能否准确使用旧依据仍需在可启动的 Harness 上联调。此轮范围是群内找回证据，跨 Session 摘要与全量检索索引另行验证。
