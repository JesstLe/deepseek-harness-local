---
name: naumi-browser
description: Naumi内置ego-lite浏览器。用户要求打开网页、查询站点、表单操作或浏览器测试时使用，工具与当前会话右侧栏共享同一真实页面。
---

# Naumi 浏览器

使用内置naumi_browser工具，action=state检查状态，action=snapshot读取当前页面结构，然后用selector执行click/fill/press。navigate接受http(s)网址。每次写操作后用snapshot确认实际结果；超时或结果不明时不要原样重放提交。

同一Naumi会话共享一个ego TaskSpace，右侧栏是该页面的实时交互视图。不要另建浏览器进程、切换到其他用户Space或读取无关个人资料。浏览器已有网站登录态不等于企业业务权限。登录、验证码、支付及其他需人工确认的步骤交给用户在右侧栏或原生ego窗口完成。

打开网站的示例参数：

```json
{"action":"navigate","url":"https://example.com"}
```

页面变化后重新snapshot再选择当前ref或稳定selector。用tabs查看当前Space页面，用select及label切换。操作仅限用户当前任务，不自动安装扩展、导入其他浏览器数据或改变系统默认浏览器。截图、Cookie和表单内容不写入交付证据，不向无关服务上传。

CLI维护入口为安装根目录下的node scripts/ego-browser.mjs，status不读取页面数据；skill打印与安装版本匹配的上游完整指引。工具不支持任意shell/JS，缺少功能时保留原始错误，不绕开既有审批。
