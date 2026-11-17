# Bot 文件交付闭环

## 模块与职责

本任务负责 Bot 原生文件交付登记、结构化回传与文件任务完成检查。负责人为本线程，文件范围为 `bot-task-{runtime,service,store}.js`、`bot-tasks.js`、新增 `bot-deliverables.js`、对应测试/文档及 package files 条目。已通知员工交互线程；不改员工菜单、记忆、client 或 bot-sidebar。

## 公共接口、依赖方向、数据/状态/事务归属

复用 Harness `deliverables/presented` 与 workspaceFiles；Session 是文件交付事件权威，任务账本持有来源会话/事件/文件坐标与检查结果，outbox 在同一事务保存文字及文件引用。文件不复制，不改变模型和权限。

## 本次实现与迁移状态

基线 main/origin/main `1d152ae065b055c38bec64d6ab40b9764a3826a8`，独立 `codex/bot-file-deliverables-20261117`。原运行代码仅提取最终文字，自媒体任务没有 present 事件，主管自己调用 present 才有卡片。历史 JSON 字段保持可读，不篡改历史结果/会话。

计划：统一交付提示、将已明确宣布且有本轮成功写入记录的文件自动登记；支持显式文件交付；文件派单通过 output=files 声明契约，无有效文件不得标记交付成功；回传原始引用并在主管消费消息时复用原生卡片。

## 验证命令、结果及证据层级

基线定向测试 47/47，退出 0（Bot 通信、真实 Cordis/Session schema/HTTP、原目录/UI 契约）。本任务集中完成后再运行新增交付与相关回归、独立副本恢复。真实执行与打包分别记录，不以模块通过冒充模型或安装包验收。

## 未完成项与下一步

实现已完成：统一交付提示、原生文件声明/自动兜底、结构化引用、文件任务检查及主管原生卡片登记。已验证全仓 365/365、补充跨工作区定向 22/22，执行证据为真实 Cordis/Session schema/HTTP/隔离文件，模型执行由确定性适配器驱动。

源码通过普通 merge 合入并推送 main `84b693a7393e8bba2da5f071449fc249acf1233f`，同步前 origin/main 为 `1d152ae065b055c38bec64d6ab40b9764a3826a8`。整合后全仓 365/365 再次通过。

本地 running=0 后增量加载 5 个交付代码模块。运行 package 与源码存在历史元数据差异，预检停止后采用仅追加本模块 files 条目，原 peerDependencies 等字段保留，其余插件文件哈希不变。返回 HTTP 200 / X-Naumi-Bot-Delivery=1。

实际模型联调：目标 Bot 用 write 写入独立测试 Markdown 文件，present 调用 0，系统登记员工卡片 1、主管 relay 卡片 1；任务 completed、delivery ready、文件来源坐标落盘。测试文件已删除、两条测试会话已归档，原 3 个 Bot 保留，结束时 running=0。重启窗口已通知员工 UI 线程释放；本任务不再占用服务。

未重建 EXE、不回填历史会话；用户浏览器实际点击验收与安装包发布仍是独立阶段，不用会话卡片记录冒充截图验收。功能模块迭代计数：1；未满三模块，不扩展其他模块。最终提交身份和证据见 VERIFICATION。
