---
name: naumi-browser
description: Naumi内置浏览器。桌面端使用原生Chromium；网页端保留旧ego接入。工具与当前会话右侧栏共享同一真实页面。
---

# Naumi 浏览器

使用内置naumi_browser工具，action=state检查状态，action=snapshot读取当前页面结构，然后用selector执行click/fill/press。navigate接受http(s)网址。每次写操作后用snapshot确认实际结果；超时或结果不明时不要原样重放提交。

桌面端工具按当前Naumi会话与右侧标签绑定到同一原生Chromium页面。navigate可在当前可见会话打开浏览器；NATIVE_BROWSER_OPEN_CURRENT_SESSION表示需要用户切换到该会话并打开侧栏。不要另建浏览器进程或读取无关资料。网页端仍使用旧ego TaskSpace，不与桌面端Cookie混用。浏览器已有网站登录态不等于企业业务权限。登录、验证码、支付及其他需人工确认的步骤交给用户在右侧栏完成。

打开网站的示例参数：

```json
{"action":"navigate","url":"https://example.com"}
```

页面变化后重新snapshot再选择当前ref或稳定selector。用tabs查看当前Space页面，用select及label切换。操作仅限用户当前任务，不自动安装扩展、导入其他浏览器数据或改变系统默认浏览器。截图、Cookie和表单内容不写入交付证据，不向无关服务上传。

桌面端resize由原生侧栏布局处理，不通过工具转发；finish保留用户页面，不清空Cookie。工具不支持任意shell/JS，缺少功能时保留原始错误，不绕开既有审批。旧ego的独立维护入口仍为node scripts/ego-browser.mjs，与桌面内核无关。
