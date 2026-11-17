# Naumi Desktop 本地部署

## 部署方式

- 官方仓库：https://github.com/deepseek-ai/deepseek-harness
- 官方运行包：`@deepseek-ai/dsh@0.2.2-rc.1`，精确锁定版本；不是从源码构建。
- Node.js：24.19.0；官方要求 >=24.9.0。
- 本地地址：`http://127.0.0.1:3080`。
- 部署目录：`E:/Workspace/naumi-desktop`。
- 数据目录：`E:/Workspace/naumi-desktop/.dsh`，不提交 Git。
- 配置文件：`config/local.json`；默认关闭遥测环境变量，只监听本机。
- 浅色主题：`.dsh/cordis.patch.yml` 中 `ui-theme.preference=light`；DeepSeek 会话日志上传关闭。
- GitHub 私有备份：https://github.com/JesstLe/naumi-desktop。

## 操作

在 PowerShell 中执行：

```powershell
cd E:\Workspace\naumi-desktop
.\Start-Naumi.ps1           # 后台运行；重复运行不会启动第二个实例
.\Start-Naumi.ps1 -Open     # 同时打开浏览器
.\Stop-Naumi.ps1            # 校验 PID 所属命令后停止本部署
```

依赖恢复：`npm ci --no-audit --no-fund`。运行日志位于 `logs/server.out.log` 和 `logs/server.err.log`。本次不配置开机自启。

桌面已有 `Naumi 工作台` 快捷方式，双击会启动服务并打开带本次启动认证令牌的地址。首次直接打开无令牌的地址不会自动取得 API 访问凭据；使用桌面快捷方式或 `Start-Naumi.ps1 -Open`。不要分享 `runtime` 中的快捷方式或服务原始日志。

## 模型与工作区

Web UI 的 **Settings → Models** 接收 DeepSeek API Key，应用将密钥存入 `.dsh/.credentials.yaml`。自定义 OpenAI 兼容服务使用 **Add model provider → Custom model API**，分别填写 API 地址、协议、模型 ID 和凭据。凭据文件、会话、日志和进程信息均排除在 Git 之外。

首次进入页面后选择工作区；建议选择具体项目目录，而不是整个磁盘。已从 CC Switch 导入 8 个分组、38 条模型路由，逐条通过实际 Harness 最小请求；现有 DeepSeek Account 登录和默认模型未更改。分组、排除项和回滚说明见 `CCSWITCH.md`。

## 配置回滚

原始配置保存在 `evidence/deployment.original.json`。执行 `bash ./ROLLBACK.sh` 恢复 `config/local.json`；重启后生效。该脚本仅恢复配置，不删除依赖、会话或凭据。验收时使用 `bash ./ROLLBACK.sh evidence/rollback-test.json` 在另一个副本上验证，正式配置保留修改。

## 实施记录

- 已完成：官方来源确认、版本选择、独立目录、配置修改、配置副本回滚、启停脚本、桌面入口、依赖安装、服务启动、HTTP/静态资源/鉴权验收、重复启动检测、停止释放端口及重新启动。
- 安装说明：首次下载连接重置，缓存重试成功；仅为五个指定版本的依赖开启安装脚本，随后 `npm rebuild` 成功。
- 源码下载：两次 Git 传输出现 early EOF；本次运行使用官方 npm 成品，不依赖源码 checkout。
- 本轮追加完成：只读读取 CC Switch、分组导入有效凭据、实际模型请求验证、保留账号登录及默认模型、配置与凭据副本回滚验证。
- 未配置开机自启；OpenCode Go 过期密钥、连接中断的局域网反代及其他缺少 API Key 的条目未作为有效路由导入。
- 验证明细：`VERIFICATION.txt`。
