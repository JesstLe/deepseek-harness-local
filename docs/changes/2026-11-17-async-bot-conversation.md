# 异步员工协作

## 模块与职责

本线程负责主管派单即时反馈、后台任务状态卡、非打断结果回传及员工工作状态。文件负责人：bot-task-runtime/service/store、bot-tasks；新增 assets/bot-task-*；bot-sidebar.js/css/model 的接待入口与工作态；host/client 仅注册本模块。员工轻量菜单、记忆数据和权限不变。其他员工 UI 线程已结束并合主线，无同文件运行中的写入任务。

## 公共接口、依赖方向、数据/状态/事务归属

任务账本是任务状态权威；原 Session/inbox 是聊天、消息回执权威；后台派单仍使用独立目标任务 Session。默认 replyMode=background，受理即返回，显式等待保留 wait。后台完成消息通过原生 next-turn followup 回传，不插入当前正在进行的模型步骤。前端只订阅真实任务，不用动画制造进度。

## 本次实现与迁移状态

基线 main/origin/main `ee6af8d83f333c7cf8f436c24425f6700cba5502`；独立 `codex/async-bot-conversation-20261117`。当前旧约定鼓励主管 wait，完成消息走 steer，可插入当前话题。将新增可选 replyMode，缺省新派单后台；旧账本缺字段保持旧语义。员工入口优先接待会话，工作会话从任务卡进入，不因开始新聊天取消旧任务。

## 验证命令、结果及证据层级

基线 Bot 通信/HTTP/文件交付 36/36 通过，退出 0。模块完成后集中运行状态、并发、任务隔离、消息归属、前端交互及相关回归。定向模拟执行、真实浏览器、实际模型与本地加载分别记录。

## 未完成项与下一步

已实现后台模式、next-turn、共享状态订阅、任务卡、工作态和接待入口；385 项全仓回归、18 项真实壳/受控任务/真实 SSE 界面检查通过，0 page errors。模型配置、员工数据和原有轻量菜单未改。

已从普通 merge 的 main `5613933399a9e6d9c81af516d6c6994ee8278f07` 加载 10 个运行文件；host/client 仅 delta，65 个无关文件与 package 保持。真实模型第一轮 5425ms、第二话题 1340ms，目标任务当时均 running；真实员工随后完成且唯一 next-turn 回传，2 测试 Session 已归档。加载后的真实只读 UI 11 项通过、0 page errors、无 mock，浏览器/context 已关闭。HTTP 200 / Async=1 / Delivery=1；最终 67 sessions / 0 running / 3 bots / revision 15。服务正常保留运行，测试任务和重启窗口已释放。

同步记录：`ee6af8d` → `5613933`；源代码提交 `3e84e3d`，本次只追加验收证据与可复验 UI 脚本，功能模块计数保持 1。旧任务无 replyMode 的幂等重试也覆盖，集中回归最终 385/385。副本回滚恢复旧 wait/next-step 行为，运行源码保持新行为。未完成项：完整头像/角色模型与安装 EXE 发布，均不属于本切片。下一步为用户在原有接待会话正常使用本地新版本。
