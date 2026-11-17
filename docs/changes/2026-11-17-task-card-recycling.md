# 输入区任务卡回收

## 模块与职责

本任务只负责 `assets/bot-task-model.js`、`bot-task-ui.js`、`bot-task.css` 的展示生命周期；更新对应测试、验收脚本与文档。负责人为本线程，无并行子任务。基线 main/origin/main：`65eac8479022234946bf2923246a02cdb69e215d`；独立分支 `codex/task-card-recycling-20261117`，worktree `E:/Workspace/naumi-task-card-recycling`。

## 公共接口、依赖方向、数据/状态/事务归属

任务账本及 Session 继续拥有业务状态、结果和文件。UI 只按会话、终态时间和本地收起偏好计算 current/history，不写任务 API，不改变派单/等待/回传/取消/重试。偏好只存 task ID、attempt、status 组成的标识，最多 500 条，不保存任务正文、结果或凭据。

## 本次实现与迁移状态

- queued/starting/running/waiting 和未知状态保留；终态 completed/failed/cancelled/interrupted 展示 8 秒后自动归入历史。首次打开时已过期的旧卡片立即回收。
- 用户展开正在阅读的详情时暂停自动回收；关闭详情后已过期的卡片立即归档。终态卡片支持手动收起，刷新及多标签页同步；新 attempt 不受旧偏好影响。
- 无当前任务时只留一行“任务记录”，异常数仍可发现；历史按需展开、每次渲染 10 条并可加载更多。成果、文件预览和任务会话入口保留。
- 使用一个最近到期 timeout，无轮询及逐卡定时器；卸载/切换会话清理，不触发模型调用。

## 验证命令、结果及证据层级

基线异步模块 8/8 通过。定向生命周期、真实壳受控数据 UI、全仓回归与加载后真实只读页面分层记录于 `evidence/task-card-recycling/VERIFICATION.txt`。

## 未完成项与下一步

已完成：391/391 全仓回归、20 项受控真实壳 UI、12 项无 mock 的已加载真实 UI（均 0 page errors）；副本回滚恢复原卡片常驻行为。普通 merge/main `c7e49e73c947b403ea4dd3669a710aaf643cf592` 已加载三份静态资源，72 个无关文件保留，后台/模型/任务账本未修改，服务 PID 保持且未重启。最后只读状态 68 sessions / 0 running / 3 bots。浏览器/context 已关闭；刷新原页面即可使用。功能切片计数 1；本切片无未完成功能项，安装包和完整头像设计不在本切片中。
