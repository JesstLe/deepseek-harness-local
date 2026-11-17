# 员工能力隐式化与轻量纠正入口

日期：2026-11-17。负责人：GPT-6.1 Sol。本任务基线 main/origin/main `1d152ae065b055c38bec64d6ab40b9764a3826a8`；独立分支 `codex/employee-invisible-experience`，隔离目录 `E:/Workspace/naumi-employee-experience`。功能切片计数1；不关闭数字员工整体目标。

## 模块与职责

普通用户与员工协作，不维护Agent控制台。默认主导航移除员工中心，不预加载高级运行/预算/同步面板。Bot原有目录、线程、任务记录、模型选择、浏览器和交付流程不替换。

文件归属：本任务独占 client.js、host.js、employee-store.js、employee-service.js、employees.js、assets/bot-sidebar.js、assets/employee-center.js和新增employee-experience三件资产。文件交付协作线程独占 bot-task-runtime.js、bot-task-service.js、bot-task-store.js、bot-tasks.js、bot-deliverables.js；本任务不编辑这些文件，不修改package.json，新前端资产由既有assets打包目录自动包含。合主线保留协作线程的package files，运行插件同步/重启前协调。

## 公共接口、依赖方向、数据/状态/事务归属

- Bot菜单发出`naumi:employee-settings`展示事件，不提交权限/模型/任务指令。新增轻量组件复用原`createEmployeeClient`和owner HTTP，操作ID、CAS、同源、来源与字段锁继续由服务器保证。
- 默认四项：调整工作方式、查看记住的内容、忘记某件事、恢复之前的设置。表单只展示回复方式、做事习惯与偏好学习开关，不出现心跳、revision、CAS、设备、预算或原始JSON。
- 高级管理按需动态加载，不在主导航常驻。入口只接受`/naumi/workspace`返回的已验证actor的owner/admin角色；离线/未登录/未知角色不显示。进入时再次核对。**这是展示门，不改变现有本机owner API的权限域，不把前端角色检查冒充新增RBAC，也不把隐藏当访问控制。** 预算、组织审批、设备授权仍在原权威模块执行。
- SQLite仍schema1；不复制档案、不迁移Bot身份、不删除Session。新增`memory_forget` owner命令只接受Bot/记忆/档案当前revision和operationId；同一事务写记忆tombstone、清除与该偏好原文精确相同的回复/做事字段、写审计。锁定冲突/版本冲突/存储失败全部回滚。
- “忘记我的偏好：原文”只做精确匹配；“忘掉刚才那条偏好”只处理当前根会话最近一条真实用户偏好。不模糊删除，不回扫历史，不删除其他Bot或另一个会话的偏好，不因关闭自动学习而禁止主动遗忘。推断候选仍等待人工确认。
- 恢复只恢复用户可见的回复方式和做事习惯；保留当前人物设定、性格、锁定字段、学习开关以及全部权限/预算。历史分页复用原timeline游标；不把第一屏30条当完整历史。
- 心跳继续由程序采样，任务状态继续来自原执行器，确定性偏好继续由服务端学习；不增加后台LLM定时器，不自动启用主动规则或私人同步。现有Agent只收到减少技术操作负担的提示，不获得直接权限/预算写入工具。

## 本次实现与迁移状态

- 旧缓存的`naumi-employees`落点回到工作台；已有Session URL优先，不抢会话。
- Bot菜单通过portal避开侧栏裁剪，支持键盘方向键/Escape、关闭后焦点恢复、窄屏；操作对话框有焦点边界、取消/确认、服务端冲突保护和明确重新载入，不隐式覆盖未保存输入。
- 已记住/待确认分开，推断人设以人类可读差异显示，不泄露内部JSON。忘记需要明确确认，历史和审计保留。
- 现有任务/交付仍由会话和企业工作流承载；本次不接管协作线程的文件卡片和结构化产物。

## 验证命令、结果及证据层级

- 原基线`node --test tests/*.test.mjs desktop/tests/*.test.cjs`：357/357，exit0，日志BASELINE_TESTS.log。
- 新增11项后集中回归首轮368/368；补同毫秒偏好的审计顺序回归共12项，整合文件交付8项后377/377，exit0；最终合主线计数及复测结果以本模块VERIFICATION.txt为准。涵盖默认隐藏、旧缓存、真实owner CRUD、角色展示、锁、CAS/存储回滚、来源/跨Bot/跨会话边界和既有模型/任务逻辑。
- 真实Harness壳+候选前端与明确加载的候选CSS，写入隔离EmployeeStore/真实HTTP；企业角色投影受控，不使用真实业务写入或付费模型。测试命令`node scripts/verify-employee-experience-ui.mjs`，结果见UI_VERIFICATION.json与UI.log。
- Playwright默认浏览器缓存缺失：首轮未进入页面；改用已安装系统Chrome、独立无痕测试context，不使用用户浏览器profile。候选bundle替换以实际安装的client.js为输入，不把Git源码与已安装旧副本误认为相同。保留初次失败日志。
- 回滚只在独立副本执行，恢复原文件/默认导航/旧API并重开员工SQLite，实际新版保留。完整四件套及命令字面结果见evidence/employee-experience。

## 未完成项与下一步

- 本模块不声称通用LLM自动记忆提取、模糊删除或自主更改组织权限；明确偏好与候选提案仍分开。
- 管理员高级面板的底层仍是local-owner管理，企业远端动作由原服务端RBAC约束；如需完全禁止本机owner查看本机数据，属于不同的信任模型，不在此展示变更中暗示实现。
- 真实企业设备登记、供应商路由/预算、主动工作启用和员工业务闭环仍单独验收；不因入口隐藏而自动打开这些开关。

## 可复用提示

```text
普通用户只需要描述任务、纠正习惯、查看成果与确认重要变更。
复用Bot稳定身份和原上下文工具；不要要求用户理解心跳、revision、内部ID或控制台。
明确偏好由本地服务保存，模型推断留候选；遗忘后用检索验证，不凭自述认定成功。
记忆、人物设定、工具权限、预算和组织审批互相独立，不通过隐藏界面合并权力。
```

## 主线同步记录

首次刷新1d152ae；完整1个功能切片后刷新并整合文件交付main84b693a（Fast-forward），同文件归属无冲突，package.json保留bot-deliverables.js。本任务不改bot-task*。遗忘“刚才”依持久events.seq排序，拒绝用同毫秒时间戳或随机UUID猜测顺序。

实际视觉检查发现首轮测试未加载候选host的CSS；该轮仅算无样式功能观察，已排除于最终视觉验收。补载真实候选样式并检查固定遮罩/布局后，发现并修复保存后的短暂无焦点期间Escape失效、冲突禁用态误报保存中，窄屏测试也区分原生导航对话框与员工弹窗。最终21项通过，0 page errors，桌面/360px图片已打开检查。回滚初次缺少desktop/installer和独立desktop依赖链接，不作为回滚通过证据；补齐复制闭包后重跑。
