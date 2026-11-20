# Luna 的 Sol / Terra 显示选项

## 模块与职责
用户要求添加 `gpt6.1sol`、`gpt6.1terra`，实际都调用 `gpt-6-luna`。已有 Sol 选项统一为精确显示名 `gpt6.1sol`，新增 Terra；Flash/`claude fable5.2` 保持不变，三个选项都保留文本＋图像声明。它们是显示别名，不声称底层模型实际为 Sol/Terra。

负责人：本线程；基线 `1fd5a03d9f5b2eea8dbee08dabae46205c40aef0`；分支 `codex/luna-display-aliases-20261120`，独立工作树 `E:/Workspace/naumi-luna-display-aliases-20261120`。模块计数 1。修改限于 model-policy、包策略标记、关联测试及文档；不修改版本、安装器、微信、浏览器或服务器。

## 公共接口、依赖方向与数据归属
- 复用原生 provider + model 选择维度，不在同一 provider 中放两个重复 model ID，也不新增 LLM 适配器或全局 wire 重写。
- Sol 保留原来源 provider、URL、协议和凭据引用，wire ID 仍为 `gpt-6-luna`。Terra 使用固定 provider `naumi-luna-terra`，从同一来源薄复制声明，唯一变化为显示名/分组选项；`apiKeyEnv`、URL、协议、预算、推理及兼容参数一致，模型 ID 仍为 `gpt-6-luna`。
- 保留实际模型 ID 于原生配置、管理详情与请求体，两个选项不被包装成两种不同的底层模型。无需复制/新增/导出密钥。
- 对保留 Terra provider 的地址、协议、引用、headers 和模型 ID 核对来源；撞名的其他来源拒绝覆盖。重复启动不重复创建，已选 Terra 的 Session 保持自身 provider，不重置成 Sol。
- 固定 rollout 标记升级为 `three-options-vision-20261120`，仅显式启用的新完整包执行。此前普通/冻结包不启用本策略，不热补已安装代码。

## 本次实现与迁移状态
当前连接本机经原生 settings CAS 已从两选项增为三选项，原生 modelCatalog 回读 `claude fable5.2`、`gpt6.1sol`、`gpt6.1terra`。后两条的真实 ID 均为 `gpt-6-luna`；默认 Sol 原 provider/ID 保持。原配置先备份，credentials 文件 hash 相同，受检 Bot/任务/群/IM 文件无变更，模型调用 0、重启 0。

## 验证命令、结果与证据层级
- 基线：模型策略、模型设置、图片准入和桌面启动 76/76，exit0。
- 修改后同一四模块集中 79/79，exit0；新增 Terra 保存选择、同源共享凭据和 provider 撞名保护。
- 真实 native pi-ai + 本地 Anthropic SSE fixture：分别选择 Sol/Terra，捕获两次实际序列化请求，`model` 都是 `gpt-6-luna`，共享同一 fixture 凭据；请求体不使用显示别名作为模型 ID。真实供应商调用 0。
- `node scripts/audit-enterprise-package.mjs`：184 文件，PASS。集中全仓与源码副本回滚结果见 `E:/NaumiEvidence/luna-display-aliases-20261120/VERIFICATION.txt`。
- 本机实际配置与原生目录回执为 `LIVE_APPLY.json`、`LIVE_CATALOG.json`，不是其他客户端的应用确认。

## 未完成项与下一步
未构建/安装/发布含新标记的完整版本，未修改47后台或为其他设备提供新授权。全员更新/后台供给缺口沿用上一切片，不因新增显示选项而完成。源代码回滚只操作独立副本，本机三选项保持生效；未重复进行任何付费视觉测试。
