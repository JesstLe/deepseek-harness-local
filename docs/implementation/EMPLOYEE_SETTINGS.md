# 员工设置入口收口

## 模块与职责
负责人：本线程；分支 `codex/settings-simplify-20261118`。基线 `e6cdab40b5f428ba78dd0943c62771d42ecf8354`，开工已 fetch。共享 checkout 与他人证据保留。
仅保留设置导航的通用设置、模型连接、MCP；Blender 在 MCP 内显示。其他设置入口及打开配置文件动作隐藏，不删除配置、不停用服务。

## 公共接口、依赖方向、数据/状态/事务归属
原生 settings.section 有注册、渲染接口，但没有导航可见性配置；不覆写 SlotCore、不靠文本匹配或 MutationObserver 隐藏 DOM。复用现有 native-*-extension 构建模式，在固定 SHA 的原生 SettingsRoot 中增加局部视图 allowlist；其原模态、快捷键、焦点、关闭、通用项和模型表单完全复用。
Blender 原组件/轮询/检测/启动/路径保存保持，只有所属 section id 与标题改为 mcp/MCP。其他 section 仍注册，Agent 预设、消息接入、创作授权及工具执行服务不变。旧选中不可见页面时原生 fallback 落到通用设置。
构建 prepare-runtime 与开发同步 sync-naumi 共用同一个幂等、校验原字节的适配器；不改 node_modules 仓库依赖真源、不新增第二套设置壳。后续上游提供 visibility 接口时可移除此补丁。

## 本次实现与迁移状态
本切片1个UI模块。文件归属：native-settings-extension、blender-settings、sync-naumi、prepare-runtime、定向测试/验证/部署脚本及本文。host/client/package、模型/API Key、MCP协议、Bot任务账本不改。首次在隔离副本中测试；加载只从固定main执行。

## 验证命令、结果及证据层级
基线 Blender 测试12/12，exit0；测试不触发模型，不启动Blender窗口。完整模块完成后集中验证原生设置、模型连接、Blender及分发接线，结果见 evidence/settings-simplify/VERIFICATION.txt。

## 未完成项与下一步
实现完成，集中验证与真实本地加载待验收。安装包不在此切片重建。隐藏入口是界面策略，不声明为后端权限隔离。
