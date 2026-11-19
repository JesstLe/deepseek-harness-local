# CUA 截图准入与模型输入能力

## 模块与职责
本线程负责 CUA 会话级图像准入、现有模型设置中的输入能力字段及集中验收。基线 `e90dcdd9669db592bc0aab4170daa74546a0807b`；分支 `codex/cua-vision-fix-20261120`。功能切片计数 1。未修改浏览器连接、微信、安装器、版本、服务代码同步器。

## 调研结论
实际失败会话选择自定义 `anthropic-messages` 通道下的 `gpt-6-luna`，配置未声明 `input`。固定官方 Harness pi-ai 适配器对这个自定义路由返回 `inputModalities:["text"]`，截图在调用 Driver 之前被阻断。官方模型目录同名型号支持图片，不证明自定义代理通道接受图片。旧 `CUA_VISION_AND_ATTACHMENTS_REQUIRED` 混合错误掩盖了能力声明与附件服务的区别。

## 公共接口、依赖方向、数据/状态/事务归属
- `cua.js → cua-admission.js → llm.resolveModelInfo / attachments.saveImages`。优先使用正在执行请求的 request-header 模型路由，其次使用 agent.options；不以其他会话或待选模型授权当前截图。
- `status.imageAdmission` 返回当前 Session 的 provider/model、inputModalities、attachmentsReady、ready、reasonCode；驱动就绪与图片准入独立。错误区分模型路由、能力解析、图像输入和附件服务，不回显 URL 或密钥。
- 继续使用现有 MCP 图像投影、原生 LocalAttachmentStore、NativeToolExecutor、企业运行门及 CUA 一次性观察/租约。截图失败不绕过保护，不允许盲点。
- 模型连接 API 复用原 settings/CAS/credentials：逐模型可选 `input:["text"]`、`["text","image"]` 或图像单独声明；省略保留原值，`null` 删除显式声明并恢复继承。字段只支持 text/image 且不能重复；发现模型只保留供应端有效明确声明，不按名称推断。
- 现有模型参数区域新增“输入能力”选择器，不新增配置存储或密钥副本，不改变默认模型、路由或预算处理。

## 本次实现与迁移状态
源码与测试已完成。没有向当前自定义供应商发起视觉推理，没有改动生产配置或 managed 文件，没有重启服务。当前已安装 0.4.5 不因源码合并而自动获得新设置 UI；失败会话仍保留原文本输入元数据。

## 验证命令、结果及证据层级
- 基线 `node --test tests/cua.test.mjs`：21/21，exit0。
- `node scripts/verify-cua-vision.mjs baseline`：真实原生附件服务已挂载、text 路由复现旧错误，capture_calls=0，exit0。
- 受影响 7 个模块集中测试：102/102，exit0。覆盖原生 pi-ai 实际适配器、逐路由能力隔离、字段增改/保留/重置、发现、原生持久化图片投影。
- `node scripts/verify-cua-vision.mjs modified`：真实固定 Driver → MCP → LocalAttachmentStore → NativeToolExecutor 图片返回，隔离 WinForms 窗口截图已打开核验；model_calls=0、desktop_writes=0，exit0。不是用户 Chrome 登录态验收。
- `node scripts/audit-enterprise-package.mjs`：PASS，183 文件，新模块纳入包。
- `node --test --test-concurrency=2 tests/*.test.mjs desktop/tests/*.test.cjs`：首次 1014/1015，未改动的 admin workspace 安装测试发生临时目录 EPERM rename；该文件定向 4/4 后，同一全仓命令重跑 1015/1015，exit0。首轮失败日志保留，不抹除。
- 四工件及独立副本回滚证据：`E:/NaumiEvidence/cua-vision-fix-20261120/VERIFICATION.txt`。恢复只操作指定副本，校验改后 hash，后续编辑拒绝覆盖；实际工作源码保持修复状态。

## 未完成项与下一步
真实供应商视觉能力尚待一次获准的小图测试；未获得测试答复前不自动调用、不自动改能力。确认该通道支持后，可通过原生 settings CAS 仅更新目标模型的 `input` 叶子，无需替换供应商/密钥/模型列表。客户端 UI 交付需下一固定 main 完整 bundle 与维护窗口，不热补运行目录。真实 Chrome 操作与 Cookies 复用仍需单独现场验收。
