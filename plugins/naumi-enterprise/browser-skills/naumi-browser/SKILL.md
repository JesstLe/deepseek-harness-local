---
name: naumi-browser
description: Naumi内置浏览器。桌面端使用原生Chromium；网页端保留旧ego接入。工具与当前会话右侧栏共享同一真实页面。
---

# Naumi 浏览器

使用内置naumi_browser工具，action=state检查状态，action=snapshot读取当前页面结构，然后用selector执行click/fill/press。navigate接受http(s)网址。每次写操作后用snapshot确认实际结果；超时或结果不明时不要原样重放提交。

桌面端默认操作当前会话右侧原生Chromium页面。用户也可通过聊天顶部「连接」打开浏览器连接面板，导出扩展并复制连接码，再在已经打开的Chrome/Edge标签页中明确点击「连接当前标签页」。此后同一工具操作原标签页，保留原Cookie、网站登录会话和浏览器密码管理器；不复制浏览器资料或读取Chrome/Edge密码库。tabs只列出当前会话原生页面和用户主动连接的标签；select可在它们之间切换。断连后不自动改操作别的页面，不关闭原浏览器、不清Cookie。

navigate可在当前可见会话打开内置浏览器；NATIVE_BROWSER_OPEN_CURRENT_SESSION表示需要用户切换到该会话并打开侧栏。内置浏览器原有账号/工作区partition继续持久保存登录态；它与外部Chrome/Edge不会隐式混用Cookie。网页登录不等于企业业务权限。验证码、二次验证、支付及需本人确认的步骤交给用户。

用户可在原生「浏览器连接」窗口中添加网站账号，密码由系统加密库保存在当前Naumi身份本机私有目录。只有用户勾选允许Agent填入的账号，才会被action=accounts按当前页面origin返回；返回仅含accountId、网站和用户名，没有密码。先snapshot找到用户名和密码输入框，再调用login，参数为accountId、usernameSelector、passwordSelector；系统在本机检查确切origin并填入，不向模型返回密码，不点击提交。页面换站、断连、超时或结果不明时保留错误，重新观察，不重放登录/提交，不改用别的标签页。无需请求用户把密码发到聊天中。

打开网站的示例参数：

```json
{"action":"navigate","url":"https://example.com"}
```

页面变化后重新snapshot再选择当前ref或稳定selector。用tabs查看当前Space页面，用select及label切换。操作仅限用户当前任务，不自动安装扩展、导入其他浏览器数据或改变系统默认浏览器。截图、Cookie和表单内容不写入交付证据，不向无关服务上传。

桌面端resize由原生侧栏布局处理，不通过工具转发；finish保留用户页面，不清空Cookie。外部浏览器连接基于用户安装的Manifest V3扩展和官方debugger接口，浏览器可能显示正在调试提示；不要求关闭或重启用户浏览器。工具不支持任意shell/JS或导出Cookie。旧ego的独立维护入口仍为node scripts/ego-browser.mjs，与桌面内核无关。
