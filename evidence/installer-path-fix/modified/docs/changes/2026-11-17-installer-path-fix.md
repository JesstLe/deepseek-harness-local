# 0.3.5：新目录安装路径丢失修复

## 模块与职责

本线程 `codex/installer-path-fix`；基线 `31d78709602b70b01629eec78d2ad6f3ec3bc716`。
只负责安装路径修复、0.3.5 版本、原生路径/安装验收和发布；会话导入尚未实施，本切片不改会话、模型或员工业务数据。
保留共享 main 的未跟踪群聊证据和其他 worktree。功能切片计数1。

## 调研结论与根因

用户截图中的 `\Naumi\uninstallerIcon.ico` 是目标目录丢失，不是卸载图标缺失。
0.3.4 的 `NaumiInstallLeave` 调用 NSIS `GetFullPathName $INSTDIR "$INSTDIR"`，对尚不存在的目标目录返回空字符串。
后续无结果检查，直接拼接 `\Naumi`，最终原生 installSection 写入图标时报错。

用真实 NSIS 编译并调用生产 `NaumiInstallLeave` + 原生 EDIT 控件，四类新目录均变成 `\Naumi`；基线输出 `BASELINE native_page_leave=FAIL ... actual=\Naumi exit=1`。
另用 API probe 证实已存在的 `E:\Workspace` 能解析，新目录用 NSIS 返回空，而 `kernel32::GetFullPathNameW` 保留完整新路径。
上一版只做解包程序启动和归档检查，未覆盖实际交互式页面提交；本次补齐原生回调和最终包安装/卸载检查，不用源码正则代替行为验收。

## 公共接口、依赖方向、数据/状态归属

- Naumi 页面仍只负责展示与路径提交；标准 electron-builder 安装/升级/卸载事务与 maintenance preflight 不替换。
- `NaumiCanonicalPath` / `un.NaumiCanonicalPath`：stack 输入路径，输出规范 drive-absolute 路径或空串；scratch registers 保留、无创建目录/注册表/用户数据写入。
- Win32 `GetFullPathNameW` 不要求目录已存在；校验驱动绝对路径、非法字符、长度与返回值。UNC/设备/相对路径不进入当前本机目录安装链。
- `NaumiInstallLeave` 先读取到 candidate、规范化、按目录名补 Naumi、再验证，成功才提交 `$INSTDIR`；空结果保持原选择并停留页面。
- `customCheckAppRunning` 最前增加安装/卸载最终目录 guard；静默与更新也验证，失败 exit43，既有活动门禁 exit42 不变。
- 最终包真实安装进一步发现ZIP解压器MAX_PATH边界：深层测试目录已正确写入图标，但在包内长相对路径处停止，超时结束。不是再次变成根路径。新增 build-time path budget，从实际 inventory 的最长路径计算安装目录上限（当前66字符），交互/静默安装都在写入前拒绝过长目录；卸载不应用安装长度上限以免阻止清理旧深目录。包内路径增长导致预算不足时构建失败，不静默截断路径。

## 本次实现与迁移状态

- 新目录、中文空格、父目录补 Naumi、尾斜线4类；相对、drive-relative、UNC、空串、超预算5类：真实 NSIS 9/9通过，验证阶段无目录写入。
- 版本 package/lock/PRODUCT_VERSION 同步0.3.5，保留Logo和定制浅色安装UI。
- 已将有缺陷0.3.4标记预发布并撤下Latest，临时稳定通道恢复0.3.2；新0.3.5正式发布后接替Latest。不删除旧资产、不覆盖已分发二进制。
- 安装包只从固定main构建，结果见证据，发布SHA与最终证据提交分别记录。

## 验证命令、结果及证据层级

- `node desktop/scripts/verify-installer-path.mjs --baseline`：生产回调失败复现，exit1。
- `node desktop/scripts/verify-installer-path.mjs`：原生行为 `NATIVE_PATH cases=8 pass=8 ... no_writes=PASS exit=0`。
- 追加路径长度边界后：`NATIVE_PATH cases=9 pass=9 ... long_path=REJECTED ... exit=0`；首次过长实际安装失败如实留在OVERLONG_INSTALL，受影响目录为本任务创建的隔离fixture，记录文件清单后已清理，不是用户安装目录。
- 全仓、源码副本回滚、实际包/安装/卸载、远端资产哈希见 `evidence/installer-path-fix/VERIFICATION.txt`。

## 未完成项与下一步

不同权限/磁盘/高DPI全矩阵未冒称完成；不覆盖用户既有Naumi安装或桌面快捷方式来验收。
会话导入在用户安装阻断修复后接续，不与此修复混写为已交付。
