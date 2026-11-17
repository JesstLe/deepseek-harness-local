# Bot 专属工作区与历史文件迁移规划

## 模块与职责

用户已选择“连历史文件一起规划迁移”。本模块负责只读盘点与迁移契约，不把扫描完成记为数据迁移完成。相关主 Bot 功能见 [主 Bot 引导](PRIMARY_BOT_ONBOARDING.md)。负责人：primary-bot-onboarding；与该切片共享独立工作树，不改其他线程的安装器和群流式渲染修复。

## 公共接口、依赖方向、数据/状态/事务归属

`node scripts/plan-bot-workspaces.mjs E:/Workspace/naumi-desktop E:/Workspace/naumi-desktop/runtime/bot-workspace-migration-plan.json`

脚本只读 BotDirectory、原生压缩 Session 事件、任务交付账本与原目录；只写指定规划文件。不创建新 Bot、Session，不触发模型，不改权限、模型配置、任务账本、Bot 元数据或文件。

- 每个账号仍使用既有独立 DSH_HOME；目标为 `<DSH_HOME>/naumi/workspaces/<stable Bot ID>`，不以可改名的员工名称当目录主键。
- 归属证据优先来自成功 write/edit 与目标任务交付引用；主管仅接收预览回执不算拥有执行者文件。共享写入标记 review，不根据最近一次聊天或主管名称猜测。
- 原生 Session、任务 ID、attempt、旧 targetCwd 和交付事件坐标仍由原引擎与任务账本拥有，规划器不改它们。
- 当前文件的 SHA256 是盘点版本，不冒充历史交付版本；执行迁移前须再次核对，变化则重新规划。

## 本次实现与迁移状态

2026-11-17 实查：3 个 Bot 的独立线程目前共用同一默认工作区。**物理工作区隔离尚未执行**，不把目录中各 Bot 的 cwd 字段或线程隔离等同于独立物理目录。

规划器读取全部已关联原生会话，无会话读取警告；归属候选共 8 个文件：

- 3 个现存、可单独归属的文件，可进入复制与哈希验收阶段。
- 2 个文件有多个写入/交付归属，需要按共享协作文件处理；建议分别复制为员工工作区快照并保留共同来源，而不是擅自选一个“唯一作者”。
- 3 个历史引用对应的文件已经不存在：其中 1 个为之前清理过的预览联调临时文件，2 个为临时读取脚本。规划器保留 missing 状态，不重新生成假文件、不把记录中的路径当作现存产物。
- 37 个文件没有可靠的 Bot 归属证据。它们保留在共享历史目录，进入共同历史归档/人工归属清单，不随意分给主管或任意员工。

真实清单（包含旧路径、新路径、Bot/Session 身份、当前大小与哈希）：`E:/Workspace/naumi-desktop/runtime/bot-workspace-migration-plan.json`。该文件为 `PLAN_ONLY`，不放入安装包，不包含 API Key、Cookie 或会话正文。

## 后续迁移切片与验收

1. running=0 且任务/群回复无在途时准入；备份目录、工作区注册、Session/任务账本，固化规划 SHA。
2. 为各 Bot 建专属目录；按已核实归属复制历史文件。目标冲突拒绝覆盖；复制后核对源/目标哈希，记录共享快照的来源与多个归属。
3. 通过原生 WorkspaceRegistry 登记目录；每个 Bot 创建新接待 home Session，继承该 Bot 自身的 preset/model/permissions，不能使用主管的权限覆盖其他 Bot。
4. 单个原子 CAS 切换未来 cwd/home；旧 home 保留在 sessionIds 历史里。既有任务继续原 targetSessionId/targetCwd，正在续办的任务不能被硬切新目录或变成重复任务。
5. 旧预览引用仍指向旧 Session/路径，因此原件暂保留；新任务用专属目录。旧文件彻底移除前，要实现并验证明确的预览重定向/历史归档接口，不能直接删除原件后宣称链接保留。
6. 逐 Bot 验证新建/聊天/新任务、旧交付预览、原任务修订、跨 Bot 文件交接和账号隔离；文件复制回滚与身份路由回滚分别验收，不删除用户在切换后新增的文件。

## 验证命令、结果及证据层级

`node --test tests/naumi-workspace-plan.test.mjs`：1/1，exit 0。覆盖作者与回执接收者分离、共享文件、缺失引用、敏感文件单列、无归属文件保留和零源目录写入。

真实只读盘点：`bots=3 files=8 copy_candidates=3 review=5 unassigned=37 warnings=0 source_writes=0 model_calls=0`。

## 未完成项与下一步

本次按用户选择完成历史文件迁移规划；上述复制、原生新 home、未来 cwd 切换与历史预览迁移仍为独立后续切片。主 Bot 功能上线不自动执行这些数据迁移，不在用户完成主 Bot 设置时悄悄搬动历史文件。
