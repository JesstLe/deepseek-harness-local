# 官方模型参数与可配置预算

日期：2026-11-17。负责人：本任务。基线8995df9da41b6a36483a1b84277396892968d69c；独立分支codex/official-model-specs-20261117，工作树E:/Workspace/naumi-official-model-specs。功能迭代1。

## 模块与职责

修复早期CC Switch导入为所有模型统一写入128000上下文/16384输出以及部分400000覆盖带来的失真。新增官方规格目录、逐模型上下文/输出预算编辑、后端范围检查与显式官方校准。目录包含86个型号、14个供应商/通道标签（Kimi Coding、Alibaba/DeepSeek单独建模），涵盖OpenAI、Anthropic、Google、DeepSeek、阿里Qwen、智谱、Kimi、MiniMax、xAI、Mistral、Cohere、豆包12家供应商。

## 公共接口、依赖方向、数据/状态/事务归属

- official-model-specs.json保存官方文档核验时间、来源URL、源SHA256、上下文/输出/输入上限、原始K/M标签和数值精度。支持精确ID，不按相似名字、前缀或uncensored后缀猜模型。规格不代表账号有访问权限。
- 文档给精确token数时保留原值；仅写K/M时保留原标签，采用保守十进制预算，不伪造二进制精确度。仅记录当前同步/默认API边界，不默认打开beta/batch/long-decode更大额度。未公布输出上限的条目保留null，不用网络搜索片段补数。
- model-specs.js负责规格投影与预算验证。上下文和输出为正整数；输出必须小于上下文；已知模型不得超官方边界。有最大输入限制时，上下文预算还受maxInput+当前输出预算约束。
- 用户配置的maxTokens是实际输出预算，不是官方最大输出能力。校准保留既有输出预算，只在超上限时下调，不自动扩大生成/付费额度；来源仅作为可查规格，不改变模型协议、reasoning wire参数、价格、API地址或Key。
- Kimi Coding条目有套餐限制，自动校准不提高已有上下文；用户可据自身授权选择理论上限内的值，账号套餐能力仍由服务端决定。未核验别名保留旧配置，仅允许调低既有预算。
- 原settings llm-pi-ai仍持有实际contextWindow/maxTokens；原适配器与compaction直接消费，无并行配置真源。原credentials仍独占密钥。未修改node_modules。
- 原owner同源POST save支持逐模型contextWindow/maxTokens；refresh-specs需expectedRevision，在单次settings mutate中校准已识别模型。CAS、只读、失败回滚保持；校准不改默认模型或已有会话所选模型。

## 本次实现与迁移状态

模型连接表单新增“模型参数”，逐行显示官方来源、总上下文、最大输入和输出能力，并分别编辑本连接预算；“官方值”恢复该模型可用上下文预算，仍保留输出预算。列表页“校准官方参数”是显式整组校准。获取模型列表、手填ID、原模型元数据及未知模型继续保留。

采集与复现：python -X utf8 scripts/refresh-official-model-specs.py默认从已核验快照重建；--fetch显式抓取官方文档并在严格解析成功后发布目录，不查询用户供应商账号、不发推理、不自动改用户配置。OFFICIAL_SOURCES.zip保留完整来源；sources/保存可读文本；SOURCE_MANIFEST.json记录摘要。后续更新须审查官方差异、测试、合入主线，再发布。

## 验证命令、结果及证据层级

基线27项模型连接/发现测试通过。定向、真实固定版适配器、原生设置UI/HTTP、全量及副本回滚见evidence/official-model-specs/VERIFICATION.txt。官方网站规格与实际供应商可用/额度验收分开。

## 未完成项与下一步

本次不探测真实供应商推理、不确认套餐、不改付费路由、不发布安装包。实际本机配置迁移、保留项、运行接入和Git主线状态按验证文件追加；旧版安装包不会因Git合并自动更新。

主线同步与集中验收：8995df9 → origin/main 318cfbb → task 19d7673，保留安装器/产品版本并行改动。定向42/42、实际设置UI/HTTP16/16、副本27/27通过；首轮全量473项中原桌面进程夹具FIXTURE_EXIT失败保留，单模块31项复测通过；整合最新主线后482/482通过，未修改桌面生命周期代码。功能迭代仍为1。

实际校准发现并修正settings规范化问题：value投影包含默认input/compat，整数组写回会物化隐式字段。已清理76个新增隐式字段、保留预算；校准改为仅写两个数值叶子，普通保存从user原始模型元数据继承。增加两项回归与真实YAML断言，定向44/44、UI17/17、最终全量484/484通过；原失败与修复证据保留。
