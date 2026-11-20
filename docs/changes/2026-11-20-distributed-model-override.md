# 全量分发目标：两模型配置替换

后续用户增加同源 Sol/Terra 两个显示选项，最新三选项及固定包标记见 [Luna 显示选项记录](2026-11-20-luna-display-aliases.md)。下文保留初次两模型切片的历史验收。

## 模块与职责
用户指定全部已分发用户只开放 `deepseek-flash`（显示 `claude fable5.2`）和 `gpt-6-luna`（显示 `gpt 6.1 sol`），两者声明文本与图像输入。显示名是自定义别名，真实供应商、协议与模型 ID 保留，不声称 DeepSeek 实际变成 Claude 或 Luna 变成 Sol。

负责人：本线程；基线 main `3475af156e3a2f8b1d4cf679747439dbb3198395`；独立分支 `codex/model-policy-override-20261120`，工作树 `E:/Workspace/naumi-model-policy-override-20261120`。模块计数 1。文件范围：新增 model-policy、原 host/model-connections 窄接入、backend 启动环境、包闭合、应用脚本与测试文档。微信、浏览器、安装器及产品版本不变。

## 公共接口、依赖方向、状态与事务归属
- `prepareRuntime` 只有显式 `NAUMI_BUILD_MODEL_POLICY=two-vision-20261120` 的完整包才写入 manifest 标记；`backend.cjs` 核对该标记，在自有 standalone/linked worker 启动时设置固定 `NAUMI_MODEL_POLICY`，清除继承环境的意外开启。`host.js → model-policy.js → settings/credentials/agentDefaultModel/agents/llm`。普通/冻结包、开发服务默认不启用，不热补已运行 managed 服务。正式开启全量标记前须补齐缺少来源设备的网关授权，不能靠发布一个使新用户不可配置的包冒充全员接通。
- 从本机已有连接选择精确 ID；Flash 优先 `ccs-deepseek-992333`，Luna 优先已视觉实测的 `ccs-provider-8c7ab447-51aed7`；不将带其他版本后缀的 Flash 视作同一模型，不把不同供应商端点合并。
- 原生 settings 一次 revision CAS：移除其他 provider，保留两条模型的 URL、协议、凭据引用、上下文、输出预算、推理及 compat，仅覆盖 `name`/`input` 并收敛模型列表。长期凭据不删除、不复制、不进入安装包。
- 首次变更前在产品 home 的 `model-policy-backups` 持久化原配置引用及默认选择。备份 fsync、原子 rename、冲突拒绝覆盖；重复启动不重复修改。配置后校验失败尝试按自身下一 revision 恢复原配置，遇到后续并发改动保留备份并报告待恢复。
- 默认模型仍有效则保持；被移除的默认/恢复会话经原 Agent.model.select 持久化映射到精确保留型号，否则选 Flash。现有在途步骤使用原生冻结路由，不取消或重放任务。
- 分发策略模式下，原模型设置 API 只读；实际 LLM stream 入口拒绝非白名单或配置漂移，不以隐藏选项代替执行检查。缺少必要来源/凭据时记录明确未就绪并阻断，不在安装包嵌入管理员密钥，也不冒充已完成服务端授权。

## 本次实现与迁移状态
当前本机通过原生 HTTP/RPC settings 接口已实际从 8 组/38 条替换为 2 组/2 条，原生 session/modelCatalog 回读也是 2 组，两条 name/input 精确匹配。默认 `gpt-6-luna` 仍有效，保持不变；原 credentials 文件 SHA256 相同，Bot/任务/群/IM 受检文件 hash 无变更；模型调用 0、重启 0。旧配置已在原产品 home 备份。当前安装仍是原 0.4.5：这次只更新了可热更新的原生模型配置，未安装新的只读 UI/推理策略模块。

全员分发尚未完成。2026-11-20 实际只读探测 47 协作 `/api/digital-employees` 返回 404，`/api/workspace` 返回 401。后者只是匿名请求未登录，不代表用户账号没有权限；前者和既有交付表明本轮没有可确认的全员模型下发回执。没有客户端清单、离线/在线设备应用确认，也没有宣称修改了别人的安装目录。

## 验证命令、结果及证据层级
- 原 main 基线：`node --test tests/naumi-model-connections.test.mjs tests/cua.test.mjs`，40/40 exit0。
- 新模块及现有模型、视觉准入、桌面启动集中：74/74 exit0。真实 native pi-ai 解析到精确两条 ID、别名及 image 能力，network=0；含持久备份、失败前零写、幂等、回滚 CAS、默认修复、配置漂移、旧模型零派发、恢复会话映射。
- `node scripts/audit-enterprise-package.mjs` PASS，新依赖 `dsh-home-paths` 显式固定现有 0.2.2-rc.1，未安装/改动共享 node_modules。
- 全仓首轮隔离 worktree 未放固定 CUA exe 导致 1 项 CUA_BUNDLE_MISSING；补入共享已校验 binary 后同一全仓命令集中重跑，原失败日志保留。最终结果见本任务 VERIFICATION。
- `node scripts/apply-model-policy-live.mjs plan`：8/38 → 两条精确映射；`apply`：PASS，原生 settings CAS + 原生模型目录回读，supplier/modelCalls=0。
- 实际 GPT Luna 视觉请求沿用上一切片获准的 1 次 HTTP200/图片数字正确证据；本轮未再次收费测试。Flash 的视觉声明来自用户明确配置要求，不冒称已向 Flash 发送图片并通过。
- 四工件及独立源码副本回滚：`E:/NaumiEvidence/model-config-override-20261120/VERIFICATION.txt`。回滚仅还原副本，不把本机实际生效的两模型配置改回。

## 未完成项与下一步
1. 尚未构建/安装/发布包含新迁移模块的完整递增版本；已分发旧版本不会因 Git 合并或本机 CAS 自动改变。
2. 固定策略的升级迁移只消费该设备已有的两条来源；没有来源的干净设备需要真正的账号专属服务端网关授权。47 原供应商导入库仍不是执行授权，不把长期密钥写进公开更新包。
3. 后台可变策略、全员设备清单、推送/拉取与 applied revision 回执、旧版准入、远程 gateway 的这两条真实协议路由仍需接续；目前没有“全部用户覆盖完成”的证据。
4. 47 服务端部署和新固定客户端完整包需要各自版本、集中验收与部署窗口。本机现有微信任务不因本模块被重启/取消。
