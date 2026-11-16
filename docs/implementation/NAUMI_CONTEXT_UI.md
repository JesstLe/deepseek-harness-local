# Naumi 对话上下文 UI 落地

## 契约

只改前端显示。左栏组件与样式不动；模型/推理等级/权限和发送仍为原生输入区。右侧团队与资源、底部监控。轨迹导航隐藏；标准模式进入高级设置。无后端、业务库、模型、密钥或执行策略变更。

## 2026-11-16 实现

- 在既有Naumi客户端中增加一项session-scoped UI注册；通过React Portal组合右侧面板。
- 原生团队详情、子智能体目录、模式标签、性能和用量控件通过叶子Slot包装移动。原component、inject、locale、store和回调保留；不搬动React拥有的DOM子树。
- 团队列表直接读取已有agentTeam和sessionStatus投影；跳转复用原生openTeammate回调。未运行不冒充完成。
- 任务文件只引用当前原生交付卡实际展示的文件并调用其原生预览按钮；全部工作区文件通过已有sidebarRight.openTab('files')打开。不存在知识库或虚构文件。
- 监控读取sessionStats、tokenUsage和contextPressure，缺失数据保持未知。原生详细统计对话框继续可达。
- 面板大小跟随中心区；窄窗口自动收起，可显式打开为覆盖层。打开原生文件面板后不挤坏正文。
- 基线原件在evidence/naumi-context-ui/original；主机代码、模型Profile、原侧栏与模型组件哈希已保存。
- 安装profile的这两个文件与源码为HardLink，直接修改源码即可被前端资产服务读取，无需复制自身或重启服务。首次同步命令因同文件而拒绝复制，随后核对HardLink身份并使用刷新加载。

## 验证进度

- 基线14项模块测试通过。
- 修改后26项模块测试通过；27项隔离Chromium真实页面检查通过，前端异常0。
- 已检查：原生模型两级菜单及9个分组、权限菜单、团队任务详情、标准模式标签、原生统计/上下文弹层、队友会话跳转、文件预览、工作区文件、文件面板全屏、上下文栏收起、全局面板切换、1440px桌面和390px窄屏、模型值与草稿不变。
- 9个保留文件哈希一致，包含后端适配、layout载体、原生侧栏和模型控件、活动profile。原有客户端代码除了增加一次UI安装调用外逐字等价。
- 副本回滚恢复两个原文件SHA256，副本不再包含新UI；活动文件仍为修改版。实际回滚命令带后续编辑哈希保护。
- 测试没有提交生成请求；模型菜单正常调用原有只读 `/api/credentials/describe`，不能把路径含credentials误判为修改凭据。没有复制企业登录Cookie，也没有测试供应商生成能力或企业业务权限。
- `live-desktop.png` / `live-mobile.png` 是隔离浏览器实际运行截图，不是静态样稿。会话可以同时接收用户从其他窗口发来的新消息，截图统计因此来自当时的真实投影而非固定样例。

## 调试与验收口径

1. 首次CSS尝试将原生上下文百分比固定定位到新栏，触发原生composer包含块与sticky滚动几何冲突；已撤掉。现在右侧显示原投影读数，通过原生控件保留详情弹层，输入和滚动恢复正常。
2. T3预览部分点击/帧与resize异步状态不同步，模型菜单实际上还需进入第二级才显示搜索框。桌面操作先在共享预览核对，再用隔离Chromium完成可重复检查。
3. 窄屏检查等待实际点击命中区域与有限动画结束，不仅以DOM存在或width数值作为通过依据。原生左栏通过自己的收起动作处理，不重写它的移动端状态。
4. 实际底层运行逻辑不改；发送、停止、审批控件仍为原生组件。此轮不以真实生成或审批写操作做测试，不把UI保留证明扩大成全部业务端到端验收。

## 运行与回滚

刷新 `http://127.0.0.1:3080` 即可加载更新，无需服务重启。

```powershell
node --test tests/naumi-enterprise.test.mjs tests/naumi-context-ui.test.mjs
node scripts/verify-naumi-context.mjs modified
node scripts/verify-naumi-context-browser.mjs
```

浏览器脚本默认复用本机已有Playwright安装，可用`NAUMI_PLAYWRIGHT_MODULE`指定其模块绝对路径，不向生产工程添加依赖。

```bash
bash evidence/naumi-context-ui/ROLLBACK.sh rollback-test
# 实际恢复原UI，保留模型/会话/数据库；然后刷新页面：
bash evidence/naumi-context-ui/ROLLBACK.sh rollback
```
