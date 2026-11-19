# 内测模型菜单两组收口

模块与职责：本线程独占 internal-trial-models 模型导出/测试、native与打包验收脚本及本文。基线 f13112085406dcbdc8c139807ba0b1100b2e3c6f；分支codex/trial-two-groups-20261119。仅内测版重新构建，正式模型配置/服务/安装不改。

调研：上一版只筛选模型而保留5个原供应商组，因此菜单泄漏CC/协议后缀并重复GPT。用户明确选择“同名GPT选一组可用即可”，本次无需新写选择器或跨endpoint路由器。直接复用原生provider.displayName：单一GPT组openai、精确Flash组claude。

公共接口、依赖方向、数据/状态/事务归属：优先使用已配置CC Codex GPT组（当前一次真实gpt-6.1-sol请求HTTP200/文本OK，输出5 tokens），保留该组5个GPT原名称/能力/凭据/endpoint；DeepSeek组只保留deepseek-flash，name=claude fable5.2。原生模型选择/草稿/推理/持久化完全不改。active overlay仅改displayName，永久种子继续保存真实名称；既有旧版测试profile不覆盖，最高层overlay将菜单收口两组。正式资源替换后移除临时展示限制。

本次实现与迁移状态：2个显示组、6个唯一型号，保留单个provider实际身份，不把两个不同endpoint强行合并。导出输入只有所选两组凭据，不含未选模型/个人数据；本地私有包不公开Release。复用0.4.3产品身份，新包以独立交付目录与hash区分；后续更高正式版可覆盖升级。

验证命令、结果及证据层级：原内测基线11/11；原生/真实打包菜单截图、切换与重开、旧测试→新版→正式版同home保持、完整包与副本回滚结果见evidence/trial-two-groups/VERIFICATION.txt。模型可用探针仅代表所选组样例gpt-6.1-sol，不扩展为所有型号的当次真实供应商验收。

未完成项与下一步：集中验证、固定main重建、包与四工件交付。功能切片1，文档0。不修改原0.4.3测试包，保留为回退原件；不运行用户正式安装器、不占3080重启窗口。
