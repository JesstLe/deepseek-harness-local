# 桌面端自动更新（0.3.0）

## 结论：是否需要服务器？

**不需要自建服务器。** 仓库已公开，GitHub Releases 同时承担三个角色：

1. **版本清单**：`latest.yml`（electron-builder 构建时自动生成，含版本号、安装包文件名、SHA-512）
2. **安装包托管**：`Naumi-Setup-x.y.z-x64.exe` 作为 Release 资产下载
3. **更新日志**：Release 描述（发布脚本从 `CHANGELOG.md` 注入），客户端弹窗直接展示

客户端用 `electron-updater` 的 GitHub provider 匿名读取，无需向用户分发 token。
仅在完全离线/内网场景才需要自建：把 `NAUMI_UPDATE_URL` 指向任意静态 HTTP(S)
目录（NAS/nginx/对象存储均可），目录里放 `latest.yml` + 安装包即可，仍然不需要
任何服务端程序。

## 客户端行为

- 启动 15 秒后首次检查，之后每 24 小时复查一次；`naumiDesktop.checkUpdates()` 支持手动触发
- 发现新版本 → 后台静默下载（进度经 `naumiDesktop.onUpdateState` 推送）
- 下载完成 → 弹窗展示更新日志 + 当前版本 → 新版本，按钮：立即重启更新 / 稍后
- **安装门禁**：仅在空闲（无连接中/启动中/关闭中、无维护锁、无运行中的浏览器队列或企业任务）时才执行 `quitAndInstall`；忙碌时保持已就绪状态，下次手动触发或退出时自动安装（autoInstallOnAppQuit）
- 与 0.2.2 安装器维护协议协同：更新重启走正常退出流程，NSIS 端 preflight 负责 quiesce 残留后端

## 安全边界

- 默认源来自打包产物 `app-update.yml`（构建期固化 GitHub 仓库）
- `NAUMI_UPDATE_URL` 覆盖仅接受 HTTPS；HTTP 仅允许回环地址，`NAUMI_UPDATE_ALLOW_INSECURE_HTTP=1` 才放行局域网 HTTP（明文有中间人风险，仅限内网自用）
- 禁止 URL 内嵌凭据；安装包完整性由 latest.yml 内 SHA-512 校验

## 发布流程（一次性一条命令）

```powershell
# 在 desktop/ 下：构建 + 提取 CHANGELOG.md 对应小节 + 创建/更新 GitHub Release
npm run release
# 追加/重发资产（不重新构建）
npm run release -- --skip-build
# 预发布通道（客户端默认不收 prerelease）
npm run release -- --prerelease
```

前提：`gh auth login` 已登录（或设置 GH_TOKEN）。发布后客户端在下一次检查时
收到通知。注意：0.3.0 是首个带更新器的版本，0.3.1 及以后才会真正收到推送。

## 相关文件

- `desktop/app/updates.cjs` 更新客户端（可注入、带门禁）
- `desktop/app/main.cjs` 集成：初始化、弹窗、安装门禁、IPC
- `desktop/app/preload.cjs` `naumiDesktop.updateState/checkUpdates/onUpdateState`
- `scripts/publish-desktop-update.mjs` 发布脚本（含 CHANGELOG 小节提取）
- `desktop/tests/updates.test.cjs` 单元测试
