# 员工与群的统一对话界面

## 模块与职责

负责人：本线程。基线 main/origin/main `8314ecb5a4d0d5917d49bc80f0f21799150de813`；独立分支 `codex/unified-bot-chat-20261117`，工作树 `E:/Workspace/naumi-unified-chat`。一完整 UI 切片，功能迭代计数 1。移除独立群聊产品入口，把员工与群放进现有 Bot 导航；线程模式与原生私聊输入/模型位置不替换。

## 公共接口、依赖方向、数据/状态/事务归属

- 运行变更仅 8 文件：host/client 注册和 6 个 assets。无任务引擎、Bot/群存储、权限、模型、package/schema 修改。host/client 按本切片 delta 合入已部署版本，保留运行环境的其他差异。
- `bot-chat-model.js` 负责统一列表、置顶偏好、按群隔离的内存草稿和单例群目录。名称/头像/成员均来自现有目录；没有写死 Chief 或团队 ID。置顶只是浏览器本地偏好，不宣称改变主管权限。
- `naumi-conversation` 是内部主区座位，不注册 sidebar.panellist 项。员工行仍打开真实 home Session；群行选择内部会话座位。旧 naumi-bot-groups 的保存选择映射到新座位。线程树保持挂载，切回线程时恢复原生会话/工作台。
- 发送/建群继续使用原 owner 同源 HTTP，持久化、幂等、队列和成员路由仍由原服务负责。失败保留草稿和请求 UUID；编辑后才换 UUID。切换对话不取消任务、不给新对话附带旧草稿。建群请求晚到时不抢回用户已经离开的页面。
- 当前群的消息按用户右侧、成员左侧显示。Markdown 由文本式 React 渲染（段落、粗体、列表、代码、表格、HTTP(S)链接），不注入原始 HTML。文件卡使用原生 dsh-resource 地址。任务详情、成员列表收进按需打开的抽屉，不占据底部聊天区。
- 读已存在的群成员 Session：使用文档化 `ctx.sessions.retain` / `await reference.ready` 返回的 `binding.eventSource`只读订阅。按真实 messageId 和 turn 过滤 text-delta、最终文本和文件引用，不显示 reasoning/tool-call，也不混其他轮次。最多按当前成员去重，rAF 合帧，切群/卸载 release。客户端打开历史不等于恢复 Host Agent，更不会 prompt。
- 群回执仍用原 GET 每 2 秒协调完成状态，群目录为全界面共用、可见时最多每 15 秒刷新一次；实时文字来自原生事件而非截图或加快轮询。权限丢失时清除群目录/当前消息展示，保留原服务的授权语义。

## 本次实现与迁移状态

统一浅色布局、组合群头像、可置顶员工、搜索员工/群、统一新增菜单、群聊气泡/头像/输入器、成员点名、草稿隔离、文件卡、任务/成员抽屉、窄屏与减少动态效果均接入。私聊聊天正文和输入器仍由原生 Harness 渲染，示例图片中展示的私聊占位不作为私聊实际验收。没有为图片修改用户数据或生成真实业务任务。

Ego 浏览器通过生产 React 组件的 file 夹具进行 13 项交互核验，0 page errors；确认原生形态事件实时输出、文件地址、两群草稿隔离、失败重试同 UUID、任务 Session 导航、建群进入同一侧栏、线程原树和 420px 不横向溢出。夹具数据全部是测试数据。公开 desktop.png/narrow.png 已打开检查。第一次驱动把百分号编码文件地址当成明文比较，第二次点击不可见原生 checkbox 而非可见 label，均调整驱动后完整重跑。第一次后续截图抢在群异步读取完成前导致空白，不作为交付图；加入精确消息就绪检查，重新渲染并检查交付图片。

## 验证命令、结果及证据层级

- `node --test tests/naumi-unified-chat.test.mjs tests/naumi-context-ui.test.mjs tests/naumi-bots.test.mjs`：37/37。随后导航迁移定向 18/18。
- `node --test --test-concurrency=4 tests/*.test.mjs desktop/tests/*.test.cjs`：505/505。
- 初始 Node 测试误从浏览器注册包导入 class，修正为原生形态 observable 测试适配器，不更改生产依赖；初始全仓 504/505 的唯一失败为旧 UI 等价断言未声明新路由恢复差异，精确扣除两处迁移后全仓通过。不是放宽业务断言。
- `node scripts/verify-bot-groups-ui.mjs` 为现有群 UI 回归入口，转到 render-unified-chat + Ego 验收；底层 HTTP/SQLite/队列测试继续保留。使用本机已有 React/esbuild 依赖目录，仅用于夹具构建，无依赖/锁文件变更。
- 基线/改版/副本回滚、真实 main 来源 UI 增量加载和原生壳只读验收见 evidence/unified-bot-chat/VERIFICATION.txt。真实数据和凭据备份不进 Git。

## 未完成项与下一步

本切片不扩展主管自动建群、群成员编辑、跨设备协作等新后端能力。实际模型群聊和文件工作流不在 UI 自动验收中触发；只读原生订阅接口经形态适配器与实际壳接入分别验证，不把夹具流写成供应商端到端证明。完成后从固定 main 加载、普通合并证据并清理本任务资源；不重建安装包。

## 用户纠正：保留原业务导航图标

用户指出早期验收夹具里的字符图标会误导。该字符仅存在于模拟外壳，正式 client.js 的 PATHS/Icon 未改变，线上当时尚未加载本切片。已把夹具改为读取正式 Icon 和品牌 SVG，移除所有临时字符，完整重跑13项UI检查；增加 SVG 路径/渲染器 SHA256 固定断言。工作台、项目与需求、交付中心、设计中心、系统连接五项的正式图标、style.css 和品牌资源均不在变更范围。
