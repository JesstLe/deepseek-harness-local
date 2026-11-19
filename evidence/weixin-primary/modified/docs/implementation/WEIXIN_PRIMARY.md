# 微信私聊遥控主 Bot

模块与职责：本线程，codex/weixin-primary-20261119，开工origin074cc24，实际worktree创建时origin前进8a6c352，基线以git首父为准。只改现有IM网关扩展、侧栏微信入口、package追加files及测试/文档；host/client仅追加资产注册。浏览器/CUA/安装包与Bot任务引擎不改。

调研：腾讯MIT项目Tencent/openclaw-weixin的npm包2.4.10（2026-10-11），下载tarball按registry SHA512校验。使用其iLink get_bot_qrcode/get_qrcode_status/getupdates/sendmessage协议结构，不安装OpenClaw、不借用其Agent执行链。来源pin/LICENSE/NOTICE在third-party/weixin。QR生成库qrcode-generator1.4.4按SHA512验证并保留MIT版权。

公共接口、依赖方向、数据/状态/事务归属：通过原owner同源/CSRF保护的/naumi/im新增weixin-start/poll/cancel/code，扫码返回的ilink_user_id作为唯一允许发送者，绑定当时账号primaryBotId，自动创建IM独立Session，后续仍归主Bot。非本人、群聊、非当前primary与手工/pair都不进入执行。UI从原sidebar.footer.action挂载，不放回已隐藏设置。token只进原credentials服务，QR会话仅内存5分钟，context/cursor进入既有im-gateway.sqlite的新增transport_state表，接口不投影token或context。

生命周期：cursor只在所有消息已完成过滤或持久化准入后提交；重收沿原inbox去重。取消/过期/primary变更/配置revision漂移拒绝旧二维码提交，credential失败清理。停用中止长轮询；旧回调不作用新连接；过期token停止轮询并要求重连。outboxUNKNOWN继续沿原人工核对规则，不盲重发、不重跑模型。

能力：本人文字私聊、原生任务/问题/单次审批回执、/stop只停当前聊天不取消独立后台任务。首切片不接群聊、代回联系人、微信附件/语音解析或文件二进制发送；非文字明确提示，文件产出发交付区提示而非把未发出的文件标成已发送。后台执行需Naumi服务保持运行。

实现与迁移状态：默认无连接不主动访问微信。扫码由用户手动确认，不复制密码/已有微信客户端数据；扫描的是微信机器人接入二维码，不是在后台读取用户全部聊天。已有钉钉/飞书原生命周期保持。加载只从固定main、空闲维护窗口最小增量，不动原模型/任务/员工数据；若存在后台任务则不重启。

验证命令、结果及证据层级：原IM网关/平台21/21基线通过；模块/隔离HTTP/真实微信扫码/收发分别记在evidence/weixin-primary/VERIFICATION.txt，不以受控协议替代真实账号。复用IMStore、IMService、IMDelivery、原Bot runtime以及原approval/question waterfall，不新建Agent或输入器。

未完成项与下一步：集中验证、固定main加载、用户扫码与本人真实私聊收发核验、四工件。真实微信授权需要用户在微信确认，未扫码前不称已连接。功能模块计数1，文档0。

## 本轮收口（2026-11-19）

同步记录：微信实现381aaa9，边界修正9981c92，已普通整合浏览器主线a654a42126ab7737bd85b6ee5a66272f1ab6fcfa为317052d；浏览器main/preload/tools及CUA安装升级实现原样保留。功能模块计数1，文档0。

验证：基线原IM21/21；微信+原IM定向最终32/32；整合全仓并发2为1006/1006，exit0；实际隔离Harness/Chrome12项通过，0 page errors、0模型调用、真实腾讯QR接口与本地二维码渲染通过，未扫码。增补二维码TTL、主身份变化、超长文字准入；已连接弹窗自动刷新真实状态，配对码提交错误在原弹窗反馈。

回滚：四工件及逐文件原/改SHA256在evidence/weixin-primary。ROLLBACK.sh仅在新建副本上恢复原6文件并移除新增文件，原IM21项通过；新增transport_state表和原cursor留存，user_version仍为1。此为源码副本回滚，不是已安装包回退，也不降级真实数据库。

交付接续：0.4.4是managed bundled runtime，禁止向已安装目录或运行profile随意热补。浏览器和微信均合入后，从固定main构建下一完整版本（拟0.4.5），核对原生代码同步计划并在空闲维护窗口升级；未正式加载、未扫码、未真实微信收发前继续记pending。扫描/确认由用户在自己的微信完成。不开公共Release、不复制用户模型凭据进标准安装包。
