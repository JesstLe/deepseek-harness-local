# 输入框内 Agent 点名

## 模块与职责
- 负责人：本任务主 Agent；功能迭代 1。
- 分支 `codex/group-inline-mentions-20261117`，隔离 worktree `E:/Workspace/naumi-inline-mentions`。
- 开工 fetch 后基线 main/origin/main：`7de781ffac355e360c4a418d2947da7873ea2367`。
- 文件归属：bot-groups.js/css、host 资产登记、bot-mentions provider、原生 trigger 扩展生成器、sync/staging 装配、对应测试/脚本和本文及 evidence/group-inline-mentions。共享 checkout 的其他任务证据和工作树不动。

## 公共接口、依赖方向、数据与生命周期归属
现有输入器已提供原生 inputTriggers source、候选图标组件、原生 MenuView、Lexical span CAS 插入、IME、方向键/Enter/Tab/Escape 和撤销。直接复用这些实际状态与生命周期；不创建 textarea、第二个 popup、另一个编辑器或全局键盘拦截器。

上游的 @ 语法限制普通词边界，且将 @ 路由到文件/Session 引用；它没有每 Session 的检测/provider 配置。因此只对固定上游 SHA 增加最小公开接口：

```js
const stop = inputTriggers.registerSessionTrigger(sessionId, {
  trigger: '@', source: 'naumi-group-agents',
  detect(draft, caret, guard, draftRev) { /* return hit, null, or undefined for native fallback */ }
});
```

- 配置只属于显式群 composer Session；离开群清理并关闭菜单。私聊/线程不注册，保留原 @文件/Session 和 /命令。原生检测函数及 MenuView、仲裁、插入和提交字节保持不变。
- `bot-mentions.js` 是 provider 薄适配层，只保存群 ID 和当前插入区间/版本/分隔信息，不另存文本草稿，不接触原生私有编辑器或复制原生行为。
- 群内任意普通文本位置（开头、中文/英文句中、换行后）输入 @ 触发；候选来自当前群的 active Bot，支持名称包含搜索。其他群与已归档成员不入候选。
- 候选 icon 直接复用 `createBotAvatar`，读取同一个 Bot 的 appearance 配色与形象；没有假图标/颜色副本。菜单无副标题或营销说明。
- 选择结果交给原生 span-CAS 插入 `@名称 `，只替换 @ 到当前光标的查询片段；前后文、附件、撤销和原生草稿归属不变。英文紧邻前缀补一个普通空格，保证沿用既有 mentionedBots 路由；行尾也保留分隔，避免连续输入吞掉前一个接收人。
- 删除提及即移除其文本路由，不另存隐式收件人列表。既有旧版手动点名草稿仍显示可移除的头像标签；新选择不产生隐藏 targets。
- 原来的独立 @ 名字面板由原生输入候选替代。任务关联、停止、Queue、附件、模型位置、群改名及导航保持原链路。

## 本次实现与迁移状态
新增 `scripts/native-agent-mentions-extension.mjs`，严格校验上游和生成产物 SHA，幂等安装；使用原子替换断开包管理器 hardlink，并保存 `.naumi-original`。`sync-naumi` 与桌面 staging 都装配；现有原生 composer transport 扩展不改。

## 验证命令、结果及证据层级
- 定向单元/真实 native service + 群改名/协作/共享 catalog 32/32；包括 Session opt-in、恢复默认来源、stale pick/成员归档、防串群、中文/英文/emoji 光标、原菜单/IME/默认语法字节不变。
- 独立 Harness + 真实原生 Lexical/原生候选 MenuView + 临时 SQLite。仅为测试浏览器精确替换原生 bundle 的同一上游模块；不改共享 node_modules。群提交截获为确定性 202，检查原生 transport 的真实文本与生产 mentionedBots 路由；不调用真实模型。
- UI 初测暴露行尾换行使提及后无分隔的问题，已按原生引用的普通空格规则修复；验证脚本改用 innerText 观测换行；重复 Escape 后同 token 不重新打开是原生行为，测试通过实际清空再输入模拟新触发。
- 完整基线、修改、回滚、UI、全量和实际加载结果记录于 `../../evidence/group-inline-mentions/VERIFICATION.txt`，不以本地夹具替代供应商模型业务验收。

## 未完成项与下一步
真实运行加载和 Git 收口以 DEPLOYMENT.json / VERIFICATION.txt 为准。安装包构建不在本切片执行；已更新后续 staging 装配。回滚只恢复本模块源码/依赖 bundle，不回滚群名、消息、任务、模型配置和用户草稿。
