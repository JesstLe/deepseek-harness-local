# Naumi 原生安装／卸载界面

## 模块与职责

2026-11-17；负责人：installer-ui；分支 `codex/naumi-installer-ui-20261117`。
初始基线 `e17dc652dbc39ec2420cc092863b30fbbb35e3be`；集中验证前已整合
`8995df9da41b6a36483a1b84277396892968d69c`。功能模块计数：1。
Bot integrity 两个后端文件及其 `.gitattributes` 证据条目原样保留；本任务不重启3080。

本模块仅负责 Windows 安装器展示和页面导航，使用真实 NSIS 原生控件，不新增 Electron 安装壳、不轮询截图模拟进度。
`desktop/installer/presentation.nsh` 为安装／卸载共用的视觉；`pages.nsh` 为页面编排。
浅色品牌侧区、Naumi Logo、低对比度 N 图形、固定网格、蓝色主操作，无营销文案。
窗口逻辑尺寸820×520；几何尺寸按 `GetDpiForWindow/96` 缩放，bitmap使用2倍源尺寸。
高 DPI 几何有契约覆盖；本机截图不等于多显示器／高 DPI 真机矩阵已完成。

## 公共接口、依赖方向、状态归属

- `npm --prefix desktop run installer:ui` 生成 pinned app-builder-lib 引擎副本、multiuser宏、视觉BMP及来源hash。
- `engine.nsi` 相对于上游仅替换 assistedInstaller 的 include；提取、安装、升级／恢复、注册表、快捷方式及卸载仍使用上游实现。
- `multiuser-init.nsh` 与 pinned 上游对应宏逐字节等价；先确定安装作用域再展示路径，避免选择路径被后续作用域初始化覆盖。
- 更新调用跳过路径页；静默参数仍使用原引擎，完成后打开应用仍走 `StdUtils.ExecShellAsUser`。
- `customCheckAppRunning`、维护准入、失败exit42、finish回执保留；UI不拥有员工数据、会话、模型或维护事务。
- 默认卸载保留个人数据；显式上游 `--delete-app-data` 参数行为没有更改。
- 不重命名真实依赖／开源许可。隐藏的是默认状态与逐文件路径控件，而非删除依赖。

### 构建接口修正

`nsis.script` 会使 electron-builder 跳过标准的卸载器两阶段生成，直接使用复制来的引擎会缺少 `UNINSTALLER_OUT_FILE`。最终实现不设置该选项；`build-desktop.mjs` 在构建进程内替换 pinned `computeFinalScript` 的输入，安装与卸载两个阶段均只替换一个页面 include，并在 finally 恢复方法。不改 node_modules 文件，不跳过标准卸载器生成、签名与体积检查；版本、函数签名和源码hash不符立即失败。9项UI契约覆盖两个阶段及恢复。

原输出目录被已有桌面进程占用时，使用 `npm --prefix desktop run build -- --output=../runtime/naumi-desktop-release-0.3.3`；不结束现有进程。正式构建输出和失败日志见BUILD.json。

## 本次实现与迁移

1. 安装页：原生路径输入／目录选择／取消／安装；检查本机绝对路径、规范化路径、保留Naumi子目录。
2. 进度页：保留真正的native progress bar；隐藏默认header、文件状态、日志按钮及日志列表，`SetDetailsPrint none`。
3. 完成页：文件阶段结束后自动前进至显式完成页，用户决定是否打开应用；不伪造百分比。
4. 卸载确认、进度、完成页使用同一视觉，保留默认个人数据策略。
5. 提取失败不展示成功页，恢复关闭按钮并提示操作未完成；维护门禁的原exit42不改。
6. 桌面候选版本0.3.3，同步desktop lock与产品版本生成物，仍从固定main构建，不自动发布Release或覆盖正在运行的安装。

## 验证命令、证据层级

详细命令、原hash、输出与退出码见 `evidence/installer-ui/VERIFICATION.txt`。

- `node --test tests/*.test.mjs desktop/tests/*.test.cjs`：完整主线及新增UI契约，集中执行。
- `node desktop/scripts/verify-installer-ui.mjs`：共享生产presentation的隔离原生NSIS编译／安装夹具，无产品注册表、快捷方式或员工数据写入，目标目录严格固定。
- `node desktop/scripts/verify-installer-ui.mjs --preview`：**只展示**生产卸载确认／完成页；无删除、注册、安装或运行应用指令；不是实际卸载验收。
- 原生安装页、真实进度、完成衔接和目录选择取消：截图与UI记录。
- `ROLLBACK.sh --test`：在另一源码副本恢复旧文件／删除新增文件，重新运行旧主线测试，当前工作树保留新版。
- 正式构建：固定main执行 `npm --prefix desktop run build`，强制fresh stage和完整资源校验；安装包hash／版本另记BUILD.json。

## 未完成项与下一步

新版完整产品安装、升级／降级、实际卸载及不同缩放显示器的原生验收仍是独立门槛；
编译、展示夹具、单元测试和构建不冒充这些结果。本次不覆盖员工现有安装或个人数据，
不调用真实模型，不改变3080当前运行代码。

## 接续提示

```text
接续installer-ui：先查VERIFICATION.txt与BUILD.json，对照固定main和包hash。
保留上游安装事务、维护准入与默认数据保留；只改presentation/pages，不改Bot或模型配置。
运行完整产品安装链前先核对现有产品安装归属；卸载展示夹具不是实际卸载证据。
```
