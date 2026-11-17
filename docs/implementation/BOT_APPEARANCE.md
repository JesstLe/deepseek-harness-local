# 图一角色 × Grok Ball 动态 Bot

## 模块与职责

当前任务独占新增 `bot-appearance-model.js`、`bot-avatar-runtime.js`、`bot-avatar.js`、`bot-avatar.css`、`grok-ball.js` 与对应预览、测试、证据。接入文件：bots / host、侧栏、右侧团队资料、员工列表、现有设置 overlay。其他工作树与任务改动保持。

## 调研与基线

- 本轮依据用户附件图一的八个角色，不沿用上一版圆团 / 豆荚设计。
- 参考项目 `https://github.com/tycoding/grok-ball`，固定 SHA `de368ce3acdc5a70e871ee46ebbe8f60b11d3d6a`。已阅读该仓库 AGENTS、SKILL、JS / TS SDK 与 LICENSE。
- 引擎 `assets/grok-ball.js` 原样保存，SHA-256 `d03f37f261da2e22e55e9b0fa40dcdab62f0a6c6dd419632a088a7c4c9bb79fa`；MIT 版权与来源清单位于 `third-party/grok-ball/`。
- 源基线 `20c91f5611d38ba1495f4e9851851017e6e618f8`，独立分支 `codex/grok-bot-20261117` / 工作树 `E:/Workspace/naumi-grok-bot`；模块迭代计数 1。

## 公共接口、依赖方向、状态与事务归属

- 纯数据 `bot-appearance-model.js` 同时供 Host schema 和客户端使用，8 形象 × 8 配色 = 64 个组合。角色名仅为视觉预设标签，不创建岗位、不重命名 Bot、不修改职责。
- 原 Grok Ball 运行时 → `bot-avatar-runtime` 适配器 → React 组件；运行时只在组件真正挂载时动态导入，Node/SSR 导入无 window 副作用。
- 原引擎的 32 表情、弹簧、眨眼、呼吸、逐点 morph、球面余弦压缩 / 背面隐藏、3D 轨道前后分层彩带、睡眠 zzz 与 confetti 不重写。
- 适配器注册附件轮廓采样点、待机眼环和识别配件。待机 eye geometry 通过固定版本 `_setExpr` 接入原 spring morph；配件通过固定版本 `ball.applyPose` 跟随 pose。私有接口耦合由源哈希、2048 渲染组合与真实浏览器检查覆盖；升级参考版本需重新验收。
- React 全部头像共用同一组件，原引擎共用 rAF，适配器只保留一个 pointermove 监听；静态卡片不跑 rAF；屏幕外、隐藏页、减少动态效果暂停；卸载释放观察器、监听和 SVG。
- Bot 目录仍属于 `BotDirectory` 原子事务；新增可选字段 `appearance: {shape, palette}`，旧记录不迁移、不读时落盘。owner 同源 POST 仅新增严格 action=appearance，带 Bot revision CAS；不开放客户端改名、职责、权限或 session 绑定越权。
- 新字段与目录修订同一次 checkpoint 发布，失败不更新内存、不发布事件；同值 no-op；并发只允许一个成功。归档 Bot 拒绝换形象。
- 侧栏与右侧读原 sessions/taskActivity 权威状态，running→32、starting→31、queued→36、waiting→35；只有显式 completed / failed 才映射33/34，不从“当前没运行”猜测任务完成。

## 本次实现与迁移状态

- 八个角色：研究员（眼镜圆形）、规划者（趋势箭头圆角方形）、执行者（扳手六边形）、守护者（盾牌胶囊）、创作者（星光云朵）、分析师（柱状图三角形）、协调者（链条不规则圆形）、观察者（雷达水滴）。
- 颜色与角色独立。预览自带原项目完整32表情选择、鼠标注视、自旋、撒花，以及35/60小尺寸；生成文件离线运行，不起服务。
- Bot 设置增加“更换形象”：临时预览、取消不写、确认保存、冲突禁用与重载、键盘焦点边界与关闭返回。侧栏 / 右侧 / 员工列表复用。
- 用户附件对应造型为矢量重建而不是裁剪静态 PNG，因而支持原项目的真实眼环与球面动画。原引擎字节一致与图形重建结果分别验证，不把源哈希等同于新造型像素级相同。

## 验证、证据层级、未完成项

- 初始相关模块 BASELINE 47/47。
- 新模块8项：64组合、原引擎哈希、旧目录兼容、磁盘回放、CAS/并发、非法输入、归档、失败写入、owner/同源、客户端精确请求与资源接入。
- 第一次全仓测试暴露浏览器脚本过早导入、菜单项数量契约更新与一次 backend SIGKILL fixture瞬态失败。修正动态导入与菜单契约；后续全仓 402/402 通过，保留首次日志，不隐藏失败。
- 独立真实 Chromium：2048 个形象/配色/表情组合；注视、自旋彩带、背面隐藏、撒花、换形象生命周期、reduced motion、窄屏、销毁，11项通过。
- 真实运行 Harness shell + 候选静态资源 + 内存目录 fixture：侧栏/右栏一致、8+8选项、取消零写、CAS保存、冲突禁用/重载、原模型与草稿保持，11项通过；零真实 Bot / 模型 / 业务写入。
- 最终同步、回滚与实际运行加载结果写入 `evidence/grok-bot/VERIFICATION.txt`，区分独立预览、受控 shell、Host 数据事务、Git main 与本机发布；安装包不因本地源码已合并而声称完成。
