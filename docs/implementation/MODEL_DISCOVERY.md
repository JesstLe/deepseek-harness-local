# 模型列表获取

日期：2026-11-17；负责人：本任务。基线 d5033d45547def77d7fb8b55efefa0b36f3e3832。
任务分支 codex/model-discovery-20261117；独立工作树 E:/Workspace/naumi-model-discovery；功能迭代1。

## 模块与职责

在现有模型连接表单和已配置卡片增加“获取模型列表”。用户显式触发后，后端获取供应商 /models，只读返回可用模型；界面搜索、多选、追加到草稿，最后仍由用户保存。
文件范围：model-connections.js、assets/model-connections.js/css；新增定向测试与验收脚本。本任务不编辑host/client注册、品牌或任务模块。

## 公共接口、依赖方向、数据/状态/事务归属

POST /naumi/model-connections，action=discover，携带id(可选)、baseURL、api、apiKey(可选)。沿用owner认证、同源请求头和JSON/大小校验。
新建使用输入的key；编辑可通过原credentials.resolve复用已有key，不向renderer回传。复用已有key时只允许原origin，换host必须显式输入新key。
OpenAI Completions/Responses使用Bearer；Anthropic使用x-api-key与anthropic-version。保留基础路径后追加/models；Anthropic优先/v1/models，已有/v1不重复拼接。仅404/405时在同一基础路径内兼容另一种/models位置，不切换主机或模型计费路由。
供应商响应严格投影id/display_name、去重；超时12秒、总响应1MiB、最多2000模型/10页，Anthropic has_more/last_id分页；不跟随重定向、不回显供应商错误正文。
发现过程不写设置、不改默认模型、不保存key、不产生推理调用。模型列表只代表接口列出的ID，不代表推理可用或价格资格已验证。

## 本次实现与迁移状态

列表支持加载、空结果、搜索、多选、失败重试；已手填ID去重保留。API地址/协议/key变更和取消/卸载会取消获取，旧响应不能污染新草稿。保存仍受原CAS约束，每组最多200模型。

## 验证命令、结果及证据层级

基线15项模型连接回归通过。定向、集中回归、隔离供应商HTTP与原生设置UI结果写入 evidence/model-discovery/VERIFICATION.txt。

## 未完成项与下一步

本次不调用真实供应商、不发布新安装包；正式本地接入和Git整合按验证文件记载。
