# 浏览器默认打开百度

日期：2026-11-17。负责人：本任务；独立分支 codex/browser-default-baidu-20261117。
基线：c1fe9f0955f5d2344cbf3f7c6a2d2523fd2fa3b3。功能模块计数：1。

## 模块与职责

Naumi 派生侧栏浏览器的初始导航。无显式 URL、无已有页面 checkpoint 的新标签页默认打开 https://baidu.com。

## 公共接口、依赖方向、数据与状态归属

保留官方 BrowserBody、控制器、原生 WebView、导航校验和恢复流程；仅改变 initialUrl 的空值分支。
显式工具 URL、about:blank 和已有 checkpoint 优先于默认页；已有页面仍使用原有显式恢复，不自动重新加载。
独立 ego Web 传输不属于本次修改。员工记忆、模型、权限、浏览历史和 Cookie 不迁移。

## 本次实现与迁移状态

构建脚本增加第五项精确替换，并同步派生 client.js/UPSTREAM.json；原 npm 包字节不变。
更新两处上游等价性测试，仅排除这一项声明的默认页差异，新增三项默认页回归。

## 验证命令、结果及证据层级

命令、原始 SHA256、基线/修改/副本回滚结果见 ../../evidence/browser-default-baidu/VERIFICATION.txt。
源代码与模块测试不等于新的安装包已发布；本任务不发布新安装包。

## 未完成项与下一步

新安装包会在下次从 main 正式构建时包含此变更。当前开发配置的运行副本接入结果另见 VERIFICATION.txt。
