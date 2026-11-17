# 消息接入界面产品化

模块与职责：仅重新设计 IM 设置页的视觉和操作层级，不扩展 IM 后端与账号权限。
负责人：本任务主代理。独立分支 codex/im-settings-polish-20261117，工作区 E:/Workspace/naumi-im-settings-polish。
基线 main/origin/main：2ae583ae00c8d112adc85be84fd38c75f6896ed7；2026-11-17 fetch 后创建。

公共接口、依赖方向、数据/状态/事务归属：沿用 createIMSettings/installIMSettingsUI、settings.section 与 /naumi/im；连接、配对、成员和回执命令及 CAS 不变。密钥仍只在当前表单，持久化归原 credentials。页面内共享平台选择组件、状态标记、图标和字段组件，不改设置外壳/导航/品牌/其他页面。

本次实现与迁移状态：界面实现与集中验证已完成，正在进行副本回滚及主线/运行核验。文件归属 assets/im-settings.js、assets/im-settings.css、本页定向UI验证/单元测试、仅双静态资源的部署脚本与本记录；其他任务不写这些文件。
设计：去掉虚线空框和重复添加按钮；空态直接为双平台选择卡；已有连接采用清晰状态、操作层级与开关；配置/配对/成员/回执统一面板语言，浅色、精细边框、真实平台图形、小屏单列、键盘可操作。

验证命令、结果及证据层级：基线 node --test tests/naumi-im-*.test.mjs → tests22/pass22/fail0，exit0。完成一个UI模块后集中验证功能及真实渲染，不调用模型或真实平台。

未完成项与下一步：副本回滚、主线与实际运行增量加载及最终截图交付。迭代计数1（本页完整产品化切片）。


## 本轮实现
- 两张整卡可点的平台选择卡替换虚线空框与重复添加入口；平台矢量图形、柔和背景、细边框和轻量悬停。不新增图片/字体依赖。
- 连接列表变为状态与操作分层的横卡：状态点、原生语义开关、编辑/验证次级操作、配对主操作；验证中显示真实请求反馈。
- 表单统一分组、字段、底部操作区；飞书/Lark 用原生 radio 分段；密钥显隐只在当前表单，取消/保存清除本地密钥状态。
- 配对分为选择与发送两步，真实有效期、复制反馈、过期状态；成员、解绑、UNKNOWN 回执继续复用原命令/CAS，未改后端权限或重发语义。
- 输入与选择器 label/control 显式关联；键盘焦点、减少动画、小屏单列均保留。

## 集中验证
`node --test tests/naumi-im-*.test.mjs tests/naumi-enterprise.test.mjs tests/naumi-context-ui.test.mjs` → tests54/pass54/fail0，exit0。
`node scripts/verify-im-settings-ui.mjs`（IM_EVIDENCE 指向本模块证据目录）→ IM_UI_COMPLETE checks=32 errors=0 inference=0，exit0。
前段为隔离真实 Harness Host、HTTP、SQLite/credentials 保存两个停用测试连接；后段为同一真实组件的受控 HTTP 状态 fixture，覆盖验证、群配对、复制、成员/CAS草稿、确认解绑、显式 UNKNOWN 补发、开关、Lark 与 reduced-motion。不是外部平台账号收发测试。
截图逐张打开检查：empty/form/connection desktop、mobile、pair。首次空态脚本误把尚未返回数据的骨架当空态，改为等待真实卡片；扩展用例定位到原生会话树后改为场景内选择器，并修正 select 的显式 label 关联，保留初始日志。

## 可复用界面约束
```text
改进 Naumi IM 设置页时，只使用原 createIMSettings 状态与 /naumi/im 命令。
空态呈现可操作平台选择，不叠加宣传语或重复入口；已有连接的编辑、验证、启停、配对分层。
保护 secret 不回填、CAS 冲突保留草稿、解绑/补发需显式确认；不要修改后端执行链路。
按空态、连接、表单、配对、成员和回执验证 1360/580/360 布局，并打开实际截图检查。
```
