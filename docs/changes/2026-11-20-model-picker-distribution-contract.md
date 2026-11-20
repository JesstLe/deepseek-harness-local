# 模型选择器分发契约：只显示模型

## 模块与职责
负责人本线程；独立 `codex/model-picker-no-provider-headings-20261120`，基线 main/origin/main `11fe56942e0c7a8ee9ace3d0aadd690b94eb760a`。功能切片1。只改原生 model-selection 薄扩展、打包/发布门禁、版本、测试/记录；不改 host/package 业务注册、模型连接/密钥、Session压缩、当前安装或服务。

## 字段来源与公共接口
- 当前机器实际文件 `E:/Workspace/naumi-desktop/.dsh/profiles/web/cordis.patch.yml` 的 `llm-pi-ai.config.providers.<id>.displayName` 分别保存截图中的 `CC · 桦 / Messages`、`CC · DeepSeek / Messages`、`GPT 6.1 Terra`；`providers.<id>.models[].name` 则保存模型选项名。
- `model-policy.js` 之前保留前两组显示名，并显式给 Terra 连接写 displayName；pi-ai provider.name → session/modelCatalog.groups[].name → 客户端 group.provider.name → 原生 MenuGroup.label。`/model` 的 optionsOf 同样带 group.label。它们不是浏览器缓存里的文案，也不是发布说明字段。
- provider标识/协议/URL/凭据归连接层，模型选择和保存归原生 ModelDirectory/Session。删除displayName会回退providerID，故本任务不修改这些持久字段，也不迁移各台设备配置。

## 本次实现与迁移状态
- 官方原生选择器缺分组标题开关。新增固定hash薄扩展，composer 将带 label 的 MenuGroup 变为有同样 key 的 React.Fragment；保留原生逐项按钮、顺序、搜索、选中/待定、推理和原RPC。`/model` 只去掉row.group呈现元数据，opaque rowId与selectionOf不改，同模型不同provider不串。
- 扩展只在隔离stage中原子写入，原始SDK备份与hash保留，未知源码/锚点/编辑过的备份拒绝。普通/测试分发均默认应用，不依赖账号或旧配置名字。
- 标准完整NSIS构建后自动运行真实EXE门禁；fresh/first旧5组17条/r2旧2组6条每例验证Bot、普通会话、群聊共用选择器，只允许模型名文本，验证切换刷新和凭据引用保持。fixture仅loopback，无正式推理。
- 发布入口强制校验本次UI二进制hash、manifest models-only-v1、完整三场景矩阵和安装器SHA绑定；旧/缺回执及旧UI均拒绝。协作规则明确禁止手工绕过，不再只验型号/数量。
- 门禁先从真正NSIS安装器提取内ZIP中的EXE/asar/原生model-selection文件，与启动验收的unpacked逐项核对；不允许只把源码树或unpacked改好了、安装器仍带旧文件。完整7-Zip通过`NAUMI_7Z`指定，默认检查标准Program Files路径及本机构建工具路径；缺解包工具则失败，不静默省略。
- legacy两例先用固定上一版EXE打开同一账号/同一端口的选择器，保留真实Cookie/磁盘缓存再覆盖到新EXE；旧包由`NAUMI_PREVIOUS_EXE`指定或读取本机上一patch稳定目录，缺输入即失败。门禁按实时modelCatalog验证全部名称和顺序，不把分发规则绑定某三个别名/数量。临时目录采用短os.tmpdir路径，避免验收自身超出Windows原生ACL路径预算；Credentials按原生YAML解析，不假设JSON格式。

## 验证命令、结果及证据层级
证据根 `D:/NaumiReleases/0.4.8/`。旧0.4.7实际EXE作baseline，后续新包由main固定构建。原始原生JS SHA256 `124c4f0fe80bb7d0c5b2da9bbc071534bfc9a3e96825980c447525eb40f87855`。源码单元、全仓、真实EXE三配置×三场景、发布拒绝路径及独立副本回滚分别留实际命令/结果，不将源码合并写成用户已更新。

## 未完成项与下一步
集中测试、固定main完整包和门禁通过后发布0.4.8更新源。保留当前运行程序，旧用户安装新包后才得到新呈现；不热改managed目录。当前本机字段只读定位，未复制/删除/改名密钥或连接。会话超限切片归另一线程，未完成时不夹带。


## 最终分发交付（覆盖上述待验状态）
- 固定main `85438d45c6f8b49949390fa6812165a5ddc0bfe1`，包含上下文恢复6acde1f；0.4.8客户端/服务统一，SDK原生UI SHA从124c4f0fe80bb7d0c5b2da9bbc071534bfc9a3e96825980c447525eb40f87855变为51ce0568c16e44a5df0aaf91582e44af34f267120df7d158327fd1b729560880。本机.dsh配置/实际安装均不改。
- 整合全仓1093/1093 exit0；定向发布/模型门禁单元结果另记。旧0.4.7 EXE实际复现标题，切换和刷新仍保持，exit0。正式安装器内EXE/asar/UI三项实际提取hash匹配，真实原生门禁19检查、3配置×9场景PASS；两个旧配置先打开旧0.4.7列表并复用同账号Cookie/缓存再升级，凭据引用保持。6次loopback回复仅用于生成普通会话，真实供应商0。
- 首轮npm完整构建在打包完成后的新门禁中exit1：测试目录过长，原生Bot目录ACL步骤失败，旧夹具还误按JSON读取原生YAML。修正为短带marker的临时目录、原生workspaceId/稳定行键及YAML解析后，同一安装器完整门禁exit0；所有失败日志保留，未绕过门禁，也未发布失败候选。早期截图等待隐藏窗口稳定及空会话/工作区定位的QA失败一并留证。
- 官方发布入口执行 `node scripts/publish-desktop-update.mjs --skip-build --target 85438d45c6f8b49949390fa6812165a5ddc0bfe1`，先强制验证同包门禁/安装器SHA，再发布https://github.com/JesstLe/naumi-desktop/releases/tag/v0.4.8，exit0；匿名feed HTTP200、GitHub资产digest/大小/固定tag核对通过。默认镜像429，直连回退保留。
- 安装器504645738字节，SHA256 `a4ac7f1d459024bdce5252eb40c06f866590195ae0ef06d34fec88b0ae5b917a`。完整包、真实截图、四工件及精确BASELINE/MODIFIED/ROLLBACK命令在D:/NaumiReleases/0.4.8/；回滚只恢复独立原生UI源码副本，实际分发包保持新状态。
- 最终QA脚本修正/文档/目标pin为验证层更新，不改变已固定安装器字节。下一次SDK/模型名/供应商名调整仍必须过同一门禁；没有承诺检测所有无关缺陷，未声称远端所有用户已安装。

- 验证层最终重开：node --test tests/model-picker-distribution.test.mjs，5/5 exit0；只补验收/发布pin和记录，不重新生成或替换v0.4.8已发布资产。发布固定SHA与后续验证主线提交分开记录于稳定VERIFICATION.txt。
