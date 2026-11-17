# Naumi Desktop

Naumi 企业协作平台：本机 Web 工作台 + Windows 桌面端 + 企业协作插件，基于官方
`@deepseek-ai/dsh` 运行包（版本精确锁定）构建。仓库：<https://github.com/JesstLe/naumi-desktop>

## 快速开始

```powershell
npm ci --no-audit --no-fund   # 安装运行时（@deepseek-ai/dsh 精确锁定）
npm start                     # 后台启动 Web 工作台 http://127.0.0.1:3080
npm stop                      # 校验 PID 后停止
npm run verify                # HTTP 健康检查
```

- `Start-Naumi.ps1 -Open`：后台启动并打开带本次启动令牌的浏览器入口；数据在 `.dsh`（不入 Git）。
- `Start-NaumiDesktop.ps1`：启动 Windows 桌面端（Electron + NSIS 安装器）。
- 模型凭据在 Settings → Models 配置，凭据/会话/日志均不入 Git。

## 桌面端构建与发布

```powershell
cd desktop
npm ci        # 桌面端依赖（electron / electron-builder / electron-updater）
npm run build     # 构建安装器（runtime/naumi-desktop-release/）
npm test          # 桌面端测试；仓库根 npm run app:test 为全量回归
npm run release   # 构建 + 更新日志注入 + 发布 GitHub Release（更新源）
```

- 自动更新：客户端默认经国内镜像检查与下载（镜像失效自动回退 GitHub 直连），
  下载完成后弹窗展示 [CHANGELOG.md](CHANGELOG.md) 对应版本的更新日志。
- 发布只从 main 构建固定版本；详见 [docs/implementation/DESKTOP_AUTO_UPDATE.md](docs/implementation/DESKTOP_AUTO_UPDATE.md)。

## 文档

- 开工前：[AGENTS.md](AGENTS.md)、[协作与交接说明](docs/AGENT_COLLABORATION.md)
- 部署与运维：[DEPLOYMENT.md](DEPLOYMENT.md)、[VERIFICATION.txt](VERIFICATION.txt)
- 模块实现记录：[docs/implementation/](docs/implementation/)、变更记录：[docs/changes/](docs/changes/)
- 定制范围与验收：[docs/implementation/NAUMI_CUSTOMIZATION.md](docs/implementation/NAUMI_CUSTOMIZATION.md)
- 模型路由：[CCSWITCH.md](CCSWITCH.md)（仅版本化凭据引用，密钥在本地应用目录）

## 上游与许可

本项目在 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
基础上定制，运行包与其许可声明通过 npm 依赖与各 `NOTICE.md` 保留；Naumi 定制部分见模块文档。
