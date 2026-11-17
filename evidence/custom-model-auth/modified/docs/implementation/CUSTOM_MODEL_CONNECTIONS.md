# 自定义模型连接与官方账户解耦

日期：2026-11-17。基线：c1fe9f0955f5d2344cbf3f7c6a2d2523fd2fa3b3。分支：codex/custom-model-auth-20261117；工作树：E:/Workspace/naumi-custom-model-auth。功能模块计数1。

## 模块与职责
移除 Naumi 组合中官方账户登录、账户控制器、账户模型适配器及官方密钥向导；使用自定义 URL/API Key 分组配置。企业协作登录、owner 认证、设备身份和企业模型网关保持原职责。
文件负责人：本线程独占新增 model-connections.js、assets/model-connections.js/css；host.js/client.js 只追加注册；cordis.patch.yml 追加禁用与无账户默认值；package.json 仅追加文件。不编辑 bot-task*、bot-deliverables 或员工 UI。

## 公共接口、依赖方向、数据/状态/事务归属
- `/naumi/model-connections`：owner GET 安全配置投影；owner 同源 POST save/remove，强制 JSON 与专用请求头，131072 字节上限。
- `llm-pi-ai` 原 settings 命名空间持有分组，沿用 live mutate 与 revision CAS。保留未触碰的 provider 及模型元数据，直接使用原适配器及发送旁单一模型选择器。
- 密钥只写原 credentials 服务。新建/轮换使用唯一引用，settings 写失败则清理新引用，不改变原密钥。不回传密钥、不写浏览器存储、不向供应商自动探测。
- 移除分组不删除可能共享的凭据引用；既有/历史引用保留在本机原凭据库中。新安装包不携带开发者配置或凭据。
- 默认模型从官方占位迁移到首个已配置模型；移除当前默认组则更新默认。已有会话保留自身模型选择，不重写任务/历史。无分组时为未配置占位，不回退官方服务。

## 本次实现与迁移状态
- 使用原“模型”设置槽替换为“模型连接”，浅色分组卡片及 URL、密码框、协议、逐行模型 ID 表单。
- OpenAI Chat Completions、OpenAI Responses、Anthropic Messages；原 CC Switch 分组保持原 ID、URL、模型元数据和凭据引用，空密钥编辑保留原值。
- 禁用账户服务/控制器/账户 UI、官方模型与账户模型、官方 onboarding/会话上报、官方搜索接口、官方插件库存以及产品遥测/反馈。通用引擎、MIT 版权与依赖包名称保留。
- Web 搜索不再使用官方账户密钥；普通 HTTP 网页读取保留。未配置新的搜索供应商时不展示为已可用。

## 验证命令、结果及证据层级
基线391/391；整合主线20c91f5（新增浏览器默认值切片）后409/409，exit0。新增15项覆盖成功/失败/CAS并发/重试/密钥轮换与失败清理/owner和同源边界/默认模型修复。真实配置装载、HTTP、headless Harness→本地SSE供应商以及原生设置页Chrome20项通过，0页面错误；未调用真实供应商。桌面/360px截图已打开检查。打包闭包83文件PASS。副本回滚与正式本地加载记录见 evidence/custom-model-auth/VERIFICATION.txt。

## 未完成项与下一步
当前模块不替代后续企业服务器验证并下发短期凭据的设计；不把本地凭据配置当企业登录。本轮不构建安装包。真实供应商调用结果单独记录，不以配置保存代替模型可用验收。

## 可复用配置示例
```json
{"action":"save","id":"custom-team","expectedRevision":0,"displayName":"团队模型","baseURL":"https://HOST/v1","api":"openai-completions","apiKey":"TOKEN","models":[{"id":"MODEL_ID"}]}
```

## 主线同步记录
原始c1fe9f0；完成1个功能模块后fetch并Fast-forward整合20c91f5，保留浏览器默认值/外观预览/任务交付等协作变更。首轮定向测试发现CRLF字符串假设与fixture注入缺项已修正；首轮全仓404/405的唯一失败为写文件引入CRLF，已保留LF源格式并通过409项。隔离headless探针初次误用Web bundle，后续发现headless默认关闭本机credential服务；修正探针配置后真实凭据库→适配器→HTTP SSE完成，未修改正式用户配置来迁就测试。
