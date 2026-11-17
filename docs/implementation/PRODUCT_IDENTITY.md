# Naumi 产品标识统一

日期：2026-11-17。基线68b4bb462fd2d3df04524f4097b723b60933bb5c。分支codex/naumi-product-identity-20261117，独立工作树E:/Workspace/naumi-product-identity。模块计数1。

## 模块与职责
统一用户可见的产品身份，不替换模型供应商身份、真实模型ID、用户消息/文件/模型输出或第三方开源版权。仅追加host/client品牌注册，原始目录未提交验收文件由协作线程保留。

## 公共接口、依赖方向、数据/状态/事务归属
product-identity.js在现有Locale公开translate边界对44个明确namespace/key（62个客户端模块静态扫描，40个生成键＋4个明确语义适配键）标签作产品适配；既有bind闭包逐次调用translate，保留语言切换、插值与动态错误状态，不扫描DOM或重写聊天内容。释放时仅撤销本包装，后续包装保持原样。作用域限定chat状态/过期账号提示、插件安装安全提示、Office预览提示、产品版本与退休账号模型标签。语言包/用户语言选择不复制、不增加语言选项；全部8种原语言生效。
运行图标仅替换原native running组件的装饰图形，原状态计时、可访问状态、布局和动效偏好保持；使用原Naumi SVG和轻量opacity动效，无截图/轮询。

## 本次实现与迁移状态
- 标签页/窗口产品名统一Naumi；设置显示Naumi桌面产品版本，不把底座版本当产品版本。
- 去除“深度求索中”和运行鲸尾；过期官方登录错误引导更新模型连接API Key，而不是伪造Naumi供应商登录。
- 插件信任和Office预览提示中的产品名统一Naumi，原安全意义不变。
- 启动/HTTP健康检查验证Naumi标识；5个历史维护脚本改用真实存在的Start/Stop-Naumi；CC Switch导入User-Agent更名。
- 桌面旧工程DeepSeek Harness/Naumi企业协作快捷方式合并为带logo的单一Naumi原生桌面入口，原件留私有runtime备份并在另一副本检验恢复。README/部署说明更新自定义连接现状；历史证据不追改，依赖命名、模型标识、许可证原样保留。

## 验证命令、结果及证据层级
基线426/426；新增10项覆盖8语言原提示、静态字典全键、插值不改写、原绑定与释放、版本打包、快捷方式副本与logo；整合退休账号兼容主线后集中结果见evidence/product-identity/VERIFICATION.txt。隔离真实Harness/本地SSE模型/Chrome26项通过，实际原生运行图标与Naumi文案、产品版本已打开截图核验，无真实供应商调用；候选/正式运行分别记录。

## 未完成项与下一步
本切片不重新制作安装包，不改变任何模型配置、权限、任务/记忆或企业业务数据。新安装包构建自动使用同一品牌资产；实际运行加载单独记录。

## 主线同步与诊断
基线68b4bb4；模块完成后整合d5033d4（Bot新动效），再提交本模块并普通merge e089a7a（退休账号上下文兼容），package新增压缩peer依赖与product-version.js均保留，不改对方任务代码。UI验证先修正新会话按钮/富文本输入器定位并创建隔离工作区，随后修正多请求SSE释放；失败轮不计通过。

## 2026-11-17 Windows 快捷方式启动闪窗

- 模块与职责。负责人 Codex，分支 `codex/naumi-shortcut-no-flash`。修复项目脚本生成的 Windows 快捷方式。旧快捷方式以 `pwsh.exe -WindowStyle Hidden` 启动时，实测 Windows Terminal 在 Naumi 主窗口前短暂显示。
- 接口与依赖。[`install-naumi-shortcut.ps1`](../../scripts/install-naumi-shortcut.ps1) 用 Windows 自带的 .NET Framework 编译器生成 GUI 子系统启动器。启动器通过 `CreateNoWindow` 运行原有 `Start-NaumiDesktop.ps1`，沿用工作目录、环境、打包版选择和开发版回退。快捷方式及历史备份归生成脚本管理，启动器与同次回执存放在一起，供回滚引用。
- 迁移。拉取主线后重新运行 `pwsh -NoProfile -File scripts/install-naumi-shortcut.ps1` 可更新本仓库已有的脚本快捷方式。NSIS 安装版的快捷方式直接指向已安装的 `Naumi.exe`。
- 验证。`npm run app:test` 在安装根目录和 desktop 依赖后通过 484/484，测试进程使用规范化的临时目录路径。回归覆盖 Windows GUI 子系统、含空格的项目路径、真实脚本调用、旧链接迁移、幂等重装、备份目标和外部链接保护。本机对 0.3.2 实际窗口事件采样，旧脚本快捷方式出现一个终端，新脚本快捷方式两轮及正式安装版桌面快捷方式一轮均只出现 Naumi 主窗口。
- 发布与同步。初始基线 `ed5653ef19cf6ef2fa3fde26703afde80d2f6e51`，集中验证前同步至 `ea0235b637cfd7ddf290b3daa7d16bc5fad5eb09`，模块计数 1。本机安装 GitHub 已发布的 0.3.2 并核对安装包 SHA-256。本次修复通过仓库快捷方式生成脚本交付，无需制作新的 NSIS 安装包。
