# 原生业务系统工具

## 当前产品约定：Agent原生发现，无新增可视化入口
2026-11-20用户明确修正：原生连接不增加可视化入口，Agent自行发现即可。本约定覆盖下方首次实现中的UI描述；原验收数字与归档保留为历史记录。
- 移除聊天头部“业务上下文”入口，以及系统连接页新增的原生业务状态面板；删除两份专用UI资产、client动态加载、host资产路由和全局CSS注入。不使用CSS隐藏假装移除。
- 保留6个Agent工具、私有主进程桥、授权/审批、模型与原系统登录入口；内部诊断API不是用户入口，不向新页面暴露。
- 业务任务由Agent调用naumi_systems自动检查可用能力，读取真实对象，自行调用naumi_business_context选择本Session的精确ID；多个候选时直接在聊天中询问，不要求用户找面板，不猜ID。
- 原项目/需求/交付/设计/系统连接页面、账户授权、输入器、草稿和导航保持不变。
- 分支codex/native-systems-headless-20261120，基线9f9ceef；本轮仅移除新增展示并补Agent发现约定，不改版本/安装器/模型配置或已安装固定资源。实际验证与回滚见本轮evidence/native-systems-headless。

## 模块与职责
2026-11-20，独立 `codex/native-systems-20261120`，实际基线 `07eba7876227c5e6599c5e03c906a81e7027c576`（开工fetch时29ed31d，建树前已新增安装验收提交）。
负责将已有项目/需求/设计/交付业务能力注册到同一Harness工具运行时。新增business-*；main/enterprise/tools仅有限桥接，host/client/package只追加接线与上下文组件；不改浏览器/微信/CUA、模型、版本或安装器。

## 调研结论与复用
- 真实当前Desktop企业桥已只读HTTP200，实际账号具admin角色；workspace含204成员、0项目/0需求/0任务/0交付。没有创建真实验收业务、登记员工、发模型或读取他人凭据。
- 现有企业前端只转发`/api/workspace`并把任务摘要放进草稿；企业员工work工具另有数字员工/租约约束，不能把它当作一般人类SSO权限代理，也不绕开其原执行门。
- 原企业`/api/commands`已在同一业务事务持久化 `_idempotencyKey` 回执，原业务服务拥有角色/对象/状态/版本及审计。本切片只有限映射，不直接改库、不实现第二份业务状态机。
- 原`/api/assets`上传没有稳定客户端幂等回执。因此上传只执行一次；响应丢失保留UNKNOWN，不把名字/大小相同当原文件证明，也不自动再次上传。原commands可显式按同一原始UUID/参数恢复。
- 设计生成继续复用固定Creation MCP、原token授权/供应商适配/下载与present生命周期，不将93项source schema称为全部已上线，也不以企业登录Cookie绕过创作授权。

## 公共接口、依赖及状态归属
- `business-contract.cjs`是Desktop/Host共享的有限契约，11项命令与既有11类读取；拒绝自定义URL、Cookie、SQL、权限/验收命令和调用者自定幂等键字段。
- `BusinessSession`在Electron主进程使用原企业Cookie快照发原系统API。Cookie只在主进程内；读取使用官方net.request，显式固定Cookie并关闭自动session cookie附加。真实Electron实验发现Chromium在连接重置时会透明重发POST，因此写入使用同一主进程的一次性Node HTTP(S)请求（关闭连接复用、不跟重定向、TLS验证保持），而不是把无幂等上传交给可自动重发的网络层。同一动作不随UI换号改成另一身份，返回前检查换号。
- `EncryptedBusinessStore`用safeStorage+本机DACL持久化原意图、账号/租户/Session/原UUID/完整参数摘要及回执；不保存Cookie。上传成功移除文件body，仅保留hash/元数据。加密不可用不降级明文，写就绪与读就绪分开。
- 复用原Desktop私有loopback认证/维护闸门，追加有限`/enterprise/business`。企业业务in-flight并入EnterpriseSession.running，更新时不漏算。
- `BusinessRuntime`只做有界投影、关系过滤及工作目录文件准入。工具：naumi_systems、naumi_business_read、naumi_business_context、naumi_business_command、naumi_business_operation、naumi_business_upload；全部走原NativeToolExecutor/审批/managed员工工具准入。普通成员不能借工具成为业务owner，admin也不等于designer/operations。
- 业务上下文是显式Session引用与CAS版本。不同账号/租户/会话不共用；原操作恢复使用冻结的原上下文，不跟随当前页面。更换账号后可明确清空旧选择再选新对象。

## 实现状态
原系统连接页补实际读取/写存储就绪与真实对象计数；聊天头部新增业务上下文选择器。原表格、导航、模型、输入器及任务草稿功能保持。
新任务不会隐式借用其他Session上下文；主Bot派任务时携带明确业务ID，执行任务先读取/选择自己的上下文。尚未新增跨Session隐藏上下文迁移或修改Bot任务账本。

## 验证命令、结果及证据层级
本切片完成后集中执行共享契约、主进程Cookie冻结/加密意图/跨身份/UNKNOWN、实际Harness NativeToolExecutor与隔离HTTP业务链、真实Electron Session与UI、原有回归及副本回滚。逐项实际结果在后续补录，不把只读线上workspace200当作真实业务写入或收费生成验收。

### 实际验收与问题修正
- 集中模块：`node --test tests/naumi-business.test.mjs desktop/tests/enterprise.test.cjs tests/naumi-enterprise.test.mjs`，58/58；加原界面契约12项，合计70/70。
- `node scripts/verify-native-systems.mjs`：17项。真实Harness作用域、原NativeToolExecutor、固定stdio MCP子进程、私有bridge、HTTP请求、原生present事件；业务数据库、供应商和该runner的OS加密为明确fixture。领取/开始→创作→下载核hash→上传→提交评审，丢提交响应原号恢复只产生1条submission，不伪称验收通过。
- `node desktop/scripts/verify-business-native.mjs`：20项。真实Electron Session/net.request、主进程单次写请求、真实safeStorage/DPAPI与Windows owner-only DACL、两次宿主启动、Cookie冻结换号、维护闸门、实际React组件交互、跨会话迟到响应、焦点及草稿保持。企业HTTP与UI数据仍为隔离fixture，没有登录或写入真实业务。
- 原始1063项全仓首轮1062通过/1失败：既有页面逐字契约尚未声明新增的两处组件接线。只扩展精确删除这两处新增片段后，再对所有旧页面保持整段逐字比较；修正后1063/1063。初轮日志保留，不以删除原断言代替验收。
- 实际Electron检查抓到业务`perform`返回Promise时`finally`提前减计数：两处调用改为`return await execute`，请求真实结束前`EnterpriseSession.running`保持忙碌；新增并发同UUID和真实宿主门检查。
- UI使用现有`slots.inject`等待原会话header子slot就绪；只追加入口，不改原输入器。请求使用AbortController+generation+当前Session校验，旧会话迟到结果不写入新选择。
- 打包扫描拒绝`business-private`目录、子路径和所有`.vault`文件，不把业务上下文/回执带进安装资源。
- 原始副本42/42；四工件包的原SHA清单绑定8个旧文件和11个新增文件。回滚仅恢复标记的独立副本，保留新源码与修改包。完整命令、输出及实际回滚状态见`evidence/native-systems/VERIFICATION.txt`。

## 使用与下一完整包接续
业务工具通过企业协作当前登录账号执行，角色/对象权限最终由原系统逐次检查。系统连接页读取实际就绪状态；会话头部可明确选择项目/需求/任务。创作生成仍需原Creation授权就绪，企业管理员角色不自动等于设计师或运营权限。

可复用任务指令：
```text
先检查已连接系统和当前业务身份，再读取我指定项目下的真实需求与任务。
使用可见的原始ID选择本会话业务上下文，保留原版本号。
在我的原有权限及工具审批范围内执行任务；创作复用现有Creation MCP。
把核对过的实际文件上传到原任务，并提交交付评审；分别报告创作、上传、提交评审的原始回执。
如果回包丢失，先查原operationId。命令只按原UUID恢复；上传UNKNOWN保持待核对，不自动重传。
```

模块迭代计数1（完整原生业务纵向切片）；同步07eba78→fc2d183，保留主线公开更新说明规则。后续整合时保留其他线程团队入口修复与测试版升级接续；源码合入不等于已安装。新native桥和Host契约必须进同一后续完整bundle，不对0.4.6仅热补一侧文件。

## 未完成项与下一步
- 持久上传的服务端幂等回执需要原系统补协议；当前明确UNKNOWN+人工核对，不虚构可重试保证。
- 创作MCP实际账号授权/工具ready和真实供应商生成单独核验，不创建token或擅自发收费请求。
- 接线不等于发布。安装/服务加载窗口另协调，保留现有0.4.6及其他在途固定包；本轮尚未重启共享服务或写真实业务。
