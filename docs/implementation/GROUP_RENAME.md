# 群组改名

## 模块与职责

- 负责人：本任务主 Agent；迭代计数 1。
- 基线：`4c44363a579cd4172d867ec8994e09ab59d4adef`；分支 `codex/group-rename-20261117`；隔离目录 `E:/Workspace/naumi-group-rename`。
- 2026-11-17 开工及整合前已 fetch origin/main，基线未变化。
- 文件范围：bot-group-store/service、bot-groups HTTP/工具、原群聊页和 catalog/CSS、对应测试与脚本、本记录及 evidence/group-rename。未改原生 composer、模型配置、导航和品牌。

## 调研与公共接口、依赖方向、状态归属

原接口仅有 create/post/prepare/interrupt，Bot 改名不等于群改名。截图里的主管缺少群管理工具，因而绕去桌面操作。保留现有群页、共享 catalog、HTTP owner 同源认证和 SQLite 事务，不增加消息解析拦截器或替代输入器。

- `POST /naumi/bot-groups` 新增 `{action:'rename', operationId: UUID, roomId: UUID, expectedName, name}`。
- 群名 trim 后为 1–80 个字符，不接受控制字符；按稳定 roomId 更新 `rooms.name`。
- `expectedName` 比较并交换，冲突 409，缺群 404；失败事务不改变群名。
- 新增兼容 v1 的 `room_name_operations` 审计表；原 rooms/members/posts/replies/post_context 不迁移。
- 同一 operationId 和 payload 重试不重复改名；经过后续改名再重试时返回当前名称，不撤销后续写入。
- Agent `bot_group_list` 读取精确 ID；`bot_group_rename` 限 Lead，身份来自实际调用者，不接受客户端伪造 actor。私聊与群聊均挂载，dispose 完整释放。
- 模型指令明确区分 Bot 名、Session 标题、群名，要求直接调用工具，重名时澄清，不操作桌面或内部文件。
- 标题铅笔打开独立小表单；保存、取消、Enter、Escape 与 IME 分离；丢回执保留操作 UUID；冲突保留草稿并要求重新打开。
- catalog 更新同群列表和详情，废弃旧轮询；selected room 不变；composer 只依赖 room.id，实际复用原生 Session、附件、草稿与生命周期。

## 本次实现与迁移状态

代码切片完成。未新增 composer 或执行链。安装后的旧页面需要刷新加载新资源。自然语言模型未来是否选择工具不由静态测试冒充实测，当前验证工具的真实注册与执行契约。

## 验证命令、结果及证据层级

- 基线：`node --test tests/naumi-bot-groups.test.mjs tests/naumi-bot-groups-http.test.mjs`，10/10，通过（旧有能力，不含改名）。
- 新模块：SQLite 持久化、事务失败回滚、并发 CAS、重试、Agent 权限/身份/注销、HTTP、catalog 旧响应及草稿保留。
- `node scripts/verify-group-rename-ui.mjs`：独立 Harness + 真实群 HTTP、SQLite、原生 composer；取消/IME/保存/冲突/丢回执重试/1360、580、360 宽度，零推理调用。
- 首次全量 565/567；两处仅固定旧工具数为 4 的断言被新增工具触发，已改为 6 并断言两个工具名及指令。
- 最终集中测试、复制回滚、Git 与运行发布凭证详见 `../../evidence/group-rename/VERIFICATION.txt`。

## 未完成项与下一步

发布与用户实际群名以 DEPLOYMENT.json 和 VERIFICATION.txt 的观测为准；不把隔离 UI 测试视为用户运行环境已更新。源代码回滚只回滚该模块文件，不倒退聊天、任务、模型配置或已经成功保存的群名。

## 主线并行整合记录

共享 main 在提交间新增 `6192368`（primary Bot 模块）。本任务已普通 merge 为 `e664224`，随后将最新 main 同步到任务 worktree；primary 的默认接待、群成员与 UI 逻辑原样保留。最终回滚基线调整为 `6192368`，避免源代码回滚撤销别人的新增模块。当前运行的并行主线加载已包含三个群后端文件和群页面 JS，本任务发布仅补齐缺失的 catalog 和 CSS（以部署哈希比对为准），不重复重启服务。初次检测服务正处于并行发布间隙，读取失败；之后确认 92 Sessions、running=0 才继续。

最终整合全量：`node --test tests/*.test.mjs desktop/tests/*.test.cjs`，581/581，通过；整合后的真实 Harness 页面复测 11 项通过，零 pageerror、零推理。
