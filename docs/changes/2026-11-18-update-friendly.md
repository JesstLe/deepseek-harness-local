# 更新可见性与新版重开闭环

模块与职责：`codex/update-friendly-20261118`，初始基线 `b2156a7732f56f07c4b719c5f3cc8181851edfb6`。负责 desktop updates、NSIS maintenance/pages/presentation 和只读启动证明；不改共享3080、模型、Bot或企业数据，不覆盖已公开0.4.0包。功能切片计数1。

公共接口、依赖方向、数据/状态/事务归属：继续使用 electron-updater 下载校验与 quitAndInstall、stock NSIS 提权/卸载/解压/注册/快捷方式、StdUtils 去提权打开。界面不拥有安装事务。installer-relaunch 只读原 desktop-runtime.json 和进程清单；其临时proof仅存在本次安装器PLUGINSDIR。原数据、身份与backend-link不迁移。

调研：真实0.3.9→0.4.0全用户更新期间约4分钟不可见；旧exe暂时不存在；文件替换结束后未检测到客户端自动重开，原快捷方式手动恢复0.4.0成功。源码另发现stock assisted elevated-inner跳过CHECK_APP_RUNNING，而customInstall依赖该步骤解出的辅助程序；这是可确定的控制流缺口，但没有旧安装器退出码现场回执，不把它冒充唯一已证实的现场根因。

本次实现与迁移状态：
- 新客户端改用可见原生安装交接；新安装器也将旧客户端的 --updated /S 转为可见流程。已绑定原注册路径/作用域，复用stock安装模式页的提权而不再问安装位置。
- 提权inner在旧版本移除前执行相同维护门禁；finish自包含解出helper。普通卸载仍可静默，未更换底层引擎。
- 更新期间显示真实native marquee，覆盖无百分比的旧版本删除，不捏造百分比/预计剩余时间。
- 完成页自动按准确exe、标准用户打开一次；新版本/当前安装位置/本次之后的readyAt/活进程身份全部成立才自动结束。缺失、旧回执、PID复用或查询未知均保留窗口，等待后开放重新打开；用户可关闭结果页，无重复安装或强杀。
- 常规首次安装、手动完成页checkbox和卸载页面保持原入口与行为。

验证命令、结果及证据层级：开发前 `node --test desktop/tests/updates.test.cjs desktop/tests/installer-maintenance.test.cjs desktop/tests/installer-ui.test.cjs desktop/tests/update-gate.test.cjs`，50/50，exit0。后续集中模块/原生UI/副本回滚待补。

未完成项与下一步：原生UI编译/交互、超时/重试/成功回执、副本回滚与Git收口；当前已安装0.4.0不会因源码修改自动变成新版。公开0.4.0固定字节不改；下一版固定main构建和真实安装升级另计。


## 集中验收与边界
- 首轮完整切片全仓896/896，exit0；隐藏PowerShell参数、隐藏QA编译/console fixture并加入窗口契约后，最终更新相关58/58，exit0。
- 真NSIS夹具复用生产maintenance/presentation/update-ui，以旧客户端/S参数进入可见更新。失败/未就绪时实际原生树显示“更新已安装”“Naumi尚未就绪，可以重新打开”和enabled重新打开/关闭；不误报已启动。
- 就绪路径：真实stock NSIS完成页调用一次隔离proof-client，fresh receipt + live image/time proof使installer PID7488自动exit0，launches=1，约21秒；真实用户desktop-runtime.json原字节保持。proof-client不是Electron，故不称完整新版或提权allusers升级验收。
- 首轮native动态替换timer导致轮询未继续，改成稳定单timer；fixture编译SetCompressor位置错误exit1已修正。首个console fixture与编译命令窗口暴露点已显式隐藏；这些开发失败均未加载真实客户端。
- CUA对native结果页的activate_window失败，未把实际鼠标点击重试记PASS；按钮绑定/去重/失败后再调用能力由模块契约覆盖，原生自动启动及超时保留页另有实际证据。
- 原生实际完成页文字/状态已经检查；未宣称高DPI/其他电脑/远端Administrator验收通过。
- 已整合最新origin/main，保留会话导入及服务loader修订。最终固定源码SHA、证据和回滚见evidence/update-friendly。当前公开及本机安装仍0.4.0；本次不覆盖旧release、不重装用户客户端、不重启3080、不调用模型。

## 交付收口
- 整合基线 a48a7d243b570b6ad2aa401eab8055eefac0571a，更新/原有更新UI/导入上下文联合77/77，exit0；本任务不改变导入、Bot、服务loader资产。
- 四件套包含17个本任务文件的原始和修改hash，回滚仅接受带标记且hash匹配的独立源码副本；恢复50/50旧测试及isSilent=true，活动源码保留isSilent=false。不是实际安装降级，不回退其他模块。
- 开发切片已完成；剩余发布门是下一版本固定main构建、实际Electron完整更新及真实allusers/提权重开验收。公开0.4.0和当前用户安装原字节保持。
