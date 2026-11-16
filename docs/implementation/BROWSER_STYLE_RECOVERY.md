# 浏览器工具栏样式恢复

2026-11-16，基线 24d4baa，分支 fix/naumi-browser-style-20261116。

## 问题与复现

浏览器派生包已改为 @naumi/dsh-sidebar-browser，但内嵌 CSS 仍标记为上游包的 data-plugin 和 data-plugin-css。真实模块加载器按 data-plugin 认领、记录和卸载样式，因此上游包被移除/刷新时会连带删除 Naumi 的 CSS；如果两包共存，CSS 身份相同还会令派生包跳过自己的样式注入。

隔离桌面端执行真实浏览器组件，再运行加载器的同款 removeOwnedStyles(upstream) 操作：工具栏从 flex 变为 block，样式数归零，重现按钮换行与文字重叠。基线图片和几何数据在 evidence/browser-style。

## 修复

- 构建脚本增加两个严格单次匹配：CSS tagId 与 tag.dataset.plugin 改为 Naumi 包名。
- 不改 CSS 内容、原生/iframe 导航实现、按钮事件、模型、权限或登录状态。
- 原生浏览器组件、存储和底层逻辑除四处产品绑定外与固定版本上游字节等价。

## 验收与交付

集中检查：原有模块、独立 CSS 所有权、两包共存后卸载上游、重复卸载/重载不丢失不重复、实际组件 320/550/800px 单行工具栏与输入框边界、收起恢复。

运行版同步与截图核验结果记录在 evidence/browser-style/VERIFICATION.txt；源码副本回滚保留原始 SHA256，恢复测试不触碰活动配置与资料。
