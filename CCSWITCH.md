# CC Switch 分组模型配置

## 当前结果

已导入 8 个分组、38 条模型路由。每条保留的路由都在本机实际运行过 Harness headless profile，并返回 `OK`、退出码 0。Web 的 `session/modelCatalog` 已读取到分组，`credentials/describe` 已确认 8 个凭据引用有效存在。不同分组可能包含同一个模型 ID；38 是路由数量，不是独立模型数量。

| CC Switch 分组 | Harness 协议 | 已验证路由数 |
| --- | --- | ---: |
| Kimi For Coding | Anthropic Messages | 3 |
| 桦 | Anthropic Messages | 3 |
| open | Anthropic Messages | 19 |
| Zhipu GLM | Anthropic Messages | 2 |
| 越狱 | Anthropic Messages | 3 |
| Codex GPT | Anthropic Messages | 5 |
| DeepSeek | Anthropic Messages | 2 |
| default（Codex） | OpenAI Responses | 1 |

模型选择器中显示 `CC · 名称 / Messages` 或 `CC · 名称 / Responses`。相同端点、密钥和协议的 Claude/OMP 条目合并，模型列表取并集；不同密钥或协议保持独立。完整模型 ID 见 `evidence/ccswitch/accepted.json`。

现有 DeepSeek Account 分组、登录记录、默认模型 `deepseek-account/deepseek-flash` 和 `high` 推理设置保持不变。新增分组由用户在模型选择器中选择，不自动切换当前会话。

## 来源与兼容性

- CC Switch 来源：`C:/Users/13357/.cc-switch/cc-switch.db`，只读打开；18 条供应商配置的 SHA-256 在操作前后相同。
- 实际密钥经 Harness 的 `credentials/set` 保存到 `.dsh/.credentials.yaml`；配置仅保存引用名，Git 不包含密钥、登录记录或备份凭据。
- 桦分组的 `gpt-6-astra[1M]` 和 `gpt-6.1-sol[1M]` 后缀拆为显示名、`contextWindow: 1000000` 和不带后缀的 API 模型 ID。两个实际 API ID 均经 Harness 验证；1M 容量来自原配置意图，本次没有进行百万 token 容量测试。
- Anthropic SDK 会追加 `/v1/messages`，导入副本删除终端重复的 `/v1`。CC Switch 原始 URL 和配置不改动。
- `open` 的目录含 174 个混合类型条目；筛选 41 个对话候选，不把图像、视频、音频生成目录当成 Harness 对话模型。初筛 21 条返回非空响应，实际 Harness 验证后保留 19 条。
- CC Switch 没有给出的模型容量采用配置中的默认值：128000 上下文、16384 最大输出；这些不是容量压测结果。原配置明确给出的容量优先保留。

## 未作为有效配置导入

- OpenCode Go：在原始端点补齐 `x-opencode-session` 后返回 `401 / api_key_expired`；安装包原生适配器亦返回过期错误。
- 反代wbuddy：普通请求连接中断，实际 Harness 流式请求也返回 `read ECONNRESET`。
- B.AI Free Models：只保存 `BAI_API_KEY` 引用，当前进程和用户环境均未检测到值；没有换用付费模型或其他账户。
- 官方占位条目：没有可导入的 API Key 路由，未覆盖应用已有的账号登录。
- 其他模型：503/model_not_found、502/upstream_failed、429 等结果保留在探测记录；只描述本轮观察，不视为永久不可用。
- `open/deepseek-v4-flash` 与 `open/deepseek-v4.1-flash` 在实际 Harness 中出现空响应或 503；针对性提高输出预算复验仍失败，因此移除。DeepSeek 自有分组的两个模型均通过。

## 验证与回滚

初筛使用最小请求；随后用安装的 `dsh --profile headless --patch ...` 逐条验证真实执行，Web 服务未停止。常规执行的原始记录、失败记录和别名修正结果分别保存在 `runtime-probes.initial.json`、`runtime-probes.json` 和 `runtime-extras.json`。最终 `accepted.json` 中每一条均对应成功的 Harness 执行证据。

```powershell
node scripts/import-ccswitch.mjs verify
python scripts/ccswitch-scan.py verify-source
& 'D:\DEV\Git\bin\bash.exe' -c './evidence/ccswitch/ROLLBACK.sh rollback-test'
```

回滚测试只恢复独立配置及凭据副本，正式配置继续保持导入状态。原配置 SHA-256、命令、输入、输出和退出状态见 `evidence/ccswitch/VERIFICATION.txt`。完整凭据原件和回滚测试副本只保留在 `.dsh/import-ccswitch`，该目录权限限于当前用户、SYSTEM 和管理员。

实际撤销本轮导入：在本机保留原始私有材料的情况下运行 `bash evidence/ccswitch/ROLLBACK.sh rollback`。脚本通过官方设置及凭据 API 删除本轮分组和引用；后续配置或密钥有变动时拒绝覆盖，不删除既有账号和其他凭据。该操作不是本次验收中对正式配置执行过的操作。

## 实施状态

- 已完成：只读源配置、去重分组、实际请求验证、别名适配、凭据写入、Web 目录确认、默认设置与既有凭据保护、独立副本回滚、文档及 Git 归档。
- 后续外部条件：OpenCode Go 需要新密钥；反代wbuddy 需要连接恢复；B.AI 需要实际凭据。没有后台持续重试。
