# 0.4.10 内嵌测试模型配置

模块与职责：本线程负责两人测试过渡配置的显式打包、升级覆盖与新模型白名单，不开发47后台。本任务基线 eedae7c1bb3a0ba80c02536808cc200311185563，独立codex/embedded-test-models-20261120；功能切片1。保留此前headless业务整合与0.4.9选择器修复。

公共接口、依赖方向、状态归属：prepareRuntime显式NAUMI_EMBEDDED_MODELS_FILE + NAUMI_EMBEDDED_TEST_ACK输入→manifest edition=embedded-test/personalCredentials=true/embeddedModels；backend既有空闲/签名停止门后、worker启动前调用embedded-models.apply。只替换原home模型providers和新增本切片专属refs，不碰会话/Bot/任务/群/其他设置；沿原受管isolated/linked两路径。凭据存原native文件；receipt只记ownedRefs/模型provider/备份id/hash，不写秘密值。

用户明确批准临时把共享配置放入新版安装包并允许覆盖两名测试用户旧配置，已知有提取风险；不是管理后台已接通的交付。源码/日志/更新说明不含Key，真正构建输入在Agent工作目录外受限私有目录，标准公开发布原默认禁密钥保持；只有声明embedded-test并显式--ack-embedded-test的受控过渡包可发布，internal-trial仍禁止发布。安装包因用户批准真实含共享测试凭据，manifest与验包不伪称无凭据。

本次实现与迁移状态：
- 显式四选项：保留原三选项，新增用户指定显示名；真实请求仍用提供的claude-sonnet-5-5，不把别名当真实底层型号。新路由按提供Anthropic协议端点，目录GET HTTP200确认精确ID，尚未发送真实推理/视觉请求。新条目先声明text，不臆测该通道视觉能力。
- 新路由为可选白名单，普通无该来源设备仍保留已有三条，不再引入0.4.6的全局阻断回归；内嵌包启动前已提供四条配置与所需refs。
- 离线升级事务先保存原cfg/cred字节，原子fsync写入，部分写失败恢复原字节；并发外来变更保留并报待恢复，不覆盖。持久receipt允许未来服务端迁移精确识别本应用所写refs。重启幂等；未知refs/records/设置节点保留。后续后台授权切换、删除应用所有旧凭据及轮换共享测试Key是下一阶段，不把本包当成已完成这些后续动作。
- 真实安装包门禁必须先核对真正内嵌资源hash，再只在NAUMI_TEST=1的隔离EXE里替换为loopback凭据/端点；实际用户Key不用于fixture推理，旧配置升级的四模型、原生Sonnet wire ID、十二场景/选择保持/凭据引用均需过门。

验证命令、结果与证据层级：32定向PASS，包含新事务、失败逐边界回滚、外来写保护、外部服务零写、资源hash、显式发布ack、可选模型真实ID及原三模型回归。证据根D:/NaumiReleases/0.4.10。全仓、真实包与发布结果后续在此补记。

未完成项与下一步：集中全仓→固定main构建0.4.10→实际包隔离升级及发布。当前用户服务未重启、配置未写入；密钥仅作为受限私有构建输入，本任务没有修改47服务器。

集中结果：全仓首轮仅既有hotfix夹具Windows目录rename EPERM，定向复测11/11通过；最终全仓1108/1108 exit0。随后补充fresh profile无llm节点/凭据文件边界，修正YAML节点构造，最终新模块8/8 exit0（全仓计数不冒加为1109）。原失败日志保留。
实际供应商最小Anthropic Messages请求1次，max_tokens16，HTTP200/OK，输入17输出4token；请求id为用户给定claude-sonnet-5-5，供应商回报model=claude-sonnet-5-5-high。无图像/桌面/个人聊天内容，未改变真实会话默认模型。此前模型目录GET200精确ID已确认。此证据是新通道小型文本验收，不冒称视觉/大上下文/高并发已验证。

实际首包门禁捕获TRIAL_EDITION_INVALID：旧trialResources把任何非空edition都当旧内部试用包，新embedded-test触发拒绝，worker尚未启动。修正为显式识别本测试edition，校验必要声明后交由专用模块处理；相关模块/原内部试用与旧测试版升级定向回归通过。失败候选未发布。静态验包原清单还引用已由headless业务切片删除的business-context-client资产，已更新为固定主线实际源，不恢复已退役资产。

旧目录实际升级还捕获了已合headless业务切片的遗留资产迁移缺口：0.4.9原官方business-context-client.js仍在目标目录，原同步器判未知extra阻止升级。只将其实际发布的官方原字节hash列为可事务退役项；修改过的同名文件继续拒绝，备份和回滚恢复原字节。相关旧链接/embedded/原试用/退役模块39/39通过。没有恢复已移除业务UI或放宽未知文件保护。门禁另修复fixture把Sol/Terra同源地址错误拆分，以及上一版0.4.9已修复标题却仍要求复现旧标题的QA假设；真实源码策略未放宽。所有失败日志保留、失败候选均未发布。

退役清单按主线headless完整删除范围核对为JS和CSS两个官方文件，均限定LF/CRLF两种已知hash，不按文件名盲删；修改任意一个同名文件继续拒绝。独立事务删除两个文件并逐字节回滚通过；补充定向结果见RETIRED_COMPLETE.log。打包中的自有第三候选在发现CSS遗漏后主动停止，未发布。
