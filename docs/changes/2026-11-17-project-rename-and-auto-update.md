# 项目更名 naumi-desktop 与自动更新交付

模块与职责：项目品牌与仓库标识统一为 Naumi Desktop；桌面端版本通知与更新日志分发。

公共接口、依赖方向、数据/状态/事务归属：

- 更新链路：`desktop/app/updates.cjs`（generic provider，镜像→GitHub 直连）依赖 latest.yml（含 SHA-512 与 releaseNotes），不依赖 GitHub API。
- 发布链路：`scripts/publish-desktop-update.mjs` 从 CHANGELOG.md 提取小节注入 latest.yml，经 gh 发布 Release。
- 运行目录迁移：`config/local.json` 的 home 指向 `E:/Workspace/naumi-desktop/.dsh`，服务进程与启动脚本均已切换。

本次实现与迁移状态：

- GitHub 仓库改名 JesstLe/naumi-desktop（旧地址 301 重定向，v0.3.0/v0.3.1 老客户端更新不受影响）。
- 更新源、发布配置、启动脚本、部署文档全部切换到新名；历史 evidence 记录保留原样。
- v0.3.2 发布：更名收口版本，安装包与 latest.yml 由发布脚本产出。

验证命令、结果及证据层级：

- `npm run app:test` 357/357 通过（含更新源探测/回退/日志注入 10 项）。
- 0.3.0 客户端真实端到端：镜像通道下载 471MB，SHA-512 与清单一致（本地验证层级）。
- 旧地址 301 与镜像跟随重定向均已实测 200。

未完成项与下一步：

- 历史提交信息清理已完成：main 与 v0.3.0/0.3.1/0.3.2 全链重写并强推
  （298c80b→4cfce9f），提交信息 0 处 deepseek 字样；Releases 与资产验证完好，
  旧仓库地址 301 且 latest.yml 双通道 200。本地旧历史分支
  （feat/naumi-desktop-chromium、feat/naumi-team-panel、fix/naumi-resource-style
  及 m55 worktree 分支）仍指向重写前历史，仅本地存在，待各负责人评审后处置。
- 后续版本发布走 `desktop/` 下 `npm run release` 单命令流程。
