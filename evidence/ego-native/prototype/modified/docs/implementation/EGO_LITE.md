# Naumi 内置浏览器接入

## 产品决定

在Harness原生右侧Sidebar注册browser类型，由ego-lite真实浏览器页面提供交互画面，不使用iframe、不重写页面CSP、不嵌入操作系统窗口。沿用原有停靠、全屏、收起、Session生命周期。左侧导航与模型位置不改。

## 上游核对

仓库commit bacaece43900e8ca68eea3b6f1663835ea38df9e提供MIT SDK和skill；浏览器为独立发行，Windows安装包0.6.3.14，官方SHA256与Authenticode签名均已核验。安装按当前用户、usage stats关闭，不设置系统默认浏览器，不导入Chrome资料。用户已完成首次引导。安装后的skill为2.2.1，与仓库入口2.2.0分开记录。

## 实现

- 原生右侧Sidebar browser类型与会话header入口，左侧导航、原有工作台、模型选择位置不动。
- browser.js提供Harness owner认证的状态与结构化操作接口，POST需同源意图header，拒绝跨域Origin、超大请求和任意脚本。
- naumi_browser原生工具按exec.agent.id绑定会话；独立bundled skill provider提供naumi-browser，不修改原desktop skill。
- 浏览器为真实ego-lite页面，不是iframe。侧栏承载JPEG交互视图；点击、输入、中文组合、粘贴、滚轮、导航历史与页面切换走相同TaskSpace。
- 浏览器原生Application目录已按固定版本复制到runtime，不复制User Data、Cookie、密码、历史。插件原生runtime/CLI与chrome.dll按锁文件SHA256检查。

## 拉伸性能修复（用户反馈）

原实现每次画面读取启动CLI，并在新CDP会话里重设视口；尺寸、轮询和用户输入共用无界FIFO，出现过时画面覆盖、拖拽积压和页面比例失配。

改动：
1. 常驻ego嵌入式Node/SDK worker，复用CDP会话。私有loopback端口绑定127.0.0.1，以随机能力令牌认证且拒绝Origin。worker随Naumi生命周期关闭；父进程退出后lease清理，不关闭员工浏览器或个人页面。
2. 仅在尺寸变化或实际视口丢失时重设viewport；普通帧读取不重复Emulation操作。JPEG按像素预算缩采样，CSS保持contain比例。
3. BrowserScheduler最多1个在途请求；被动帧仅保留1个待办，尺寸只保留最新值。拖动期间暂停远端resize与轮询，松手和180ms稳定后只应用最终尺寸。
4. 版本号淘汰旧帧，文字与滚轮连续输入组合但不跨点击重排；点击按等比画面的实际区域映射，留白不点击。
5. 隐藏/收起停止轮询；卸载取消请求、清空计时器及观察器；写操作结果不明时不重放。

## 当前验证

- 原模块基线36/36；集成与调度器模块测试52/52。
- 真实浏览器6项：语义填表、中文键盘、历史、HttpOnly Cookie跨导航/刷新保留、页面列表，以及X-Frame-Options DENY站点显示。
- 真实侧栏16项通过，包括鼠标输入、中文组合、收起恢复、移动端、模型保持、无前端错误和拉伸专项。
- 连续55次原生handle拖动，期间0个resize，松手后1个最终resize；79个动画帧采样，P95=17ms，max=17ms。该数据是本机fixture测量，不是所有员工机器的帧率承诺。
- 相同8轮画面读取：旧版启动10个进程、frame中位194ms、总2457ms；常驻版启动1个worker、frame中位69ms、总510ms，视口保持800x600。
- 原上下文UI真实Chromium27/27通过；现有desktop仍75个工具、模型9组、browser/desktop skill均可见。未发起模型生成、真实业务写操作或登录数据迁移。
- protected文件8份哈希保持原值。源文件和已安装profile在副本中执行真实rollback，恢复7份原文件、禁用browser集成并保留agent-desktop；活动目录仍为集成后状态。

## 打包、回滚和后续

`runtime/ego-lite-win32-x64-0.6.3.14.zip`为纯浏览器离线runtime，738文件、293684260字节，SHA256为139b82c01274ea5acc8e4485c64b70059d3177694e5afcf3a099f8a17d4f4cb2。已重新打开并执行CRC检查。该大文件保留在本地runtime，不推入Git普通对象；源码含setup/package脚本与离线包清单。

`evidence/ego-lite/`提供MODIFIED_FILE.zip、DIFF_FILE.patch、VERIFICATION.txt、ROLLBACK.sh、原始快照及JSON报告。默认rollback脚本仅在副本测试，显式rollback才改活动目录；执行后重启Naumi并刷新页面。回滚保留浏览器安装、离线包与个人浏览器profile，不执行卸载或清除数据。

复验：

```powershell
node --test tests/naumi-enterprise.test.mjs tests/naumi-context-ui.test.mjs tests/agent-desktop.test.mjs tests/ego-browser.test.mjs tests/ego-browser-scheduler.test.mjs
node scripts/verify-ego-browser.mjs
node scripts/verify-ego-browser-ui.mjs
node scripts/verify-ego-browser-live.mjs
node scripts/verify-ego-browser-state.mjs rollback-test
```

性能前后对比脚本使用evidence/ego-lite/performance-original保存的原版本快照，可重复运行；这些文件仅用于基线测量，不被运行服务加载。

当前验收Windows x64；macOS/Linux包没有制作。这里交付浏览器模块及离线组件，不等于完整员工安装程序、企业统一登录或服务端API配置已经完成。首次个人引导仍由员工确认。浏览器本体为上游独立发行，与仓库MIT SDK许可证分别保留，不修改上游二进制。
