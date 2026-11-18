# 交付页与折叠侧栏视觉收敛

模块与职责：根据用户截图优化交付中心断连态、真实交付列表及56px折叠导航。仅UI，不扩展企业功能或改身份/模型/任务。

基线：main/origin/main72e11b6a286bba8e11db90a0edeb32653301a52e。负责人本任务，独立codex/delivery-ui-polish-20261118。文件范围client.js交付页子组件、host.js一项CSS路由/样式、delivery-center.css、bot-sidebar.css折叠规则、对应测试/QA/本记录。其他业务导航、图标、模型位置和底层状态保持。

公共接口、依赖方向、数据/状态/事务归属：复用原useBusiness/refresh、原workspace GET、原权限状态、原Badge与外链/登录地址；三组概览只统计已授权数据，未连接显示横线不伪造0；搜索/状态切换只过滤已获取数据，不发新增请求。Bot沿用原Navigation/Avatar/BotRow/目录/Session；修正被菜单/任务按钮挤压的compact hit target，隐藏compact的次要按钮，不替换状态和生命周期。展开后菜单/任务按钮原样可用。

本次实现：交付页浅灰白底、三项真实概览、交付记录区、克制的文件装饰与断连动作；已连接列表支持本地搜索/状态筛选、原版本和审核状态/原审阅外链。空、加载、断连、权限不足、错误状态明确区分，无假文件、假进度、营销文案。新CSS仅scope交付页，不改原style.css及其他业务页面。56px侧栏为独立36px Bot点击区、29px头像；次要按钮不占位；保留原滚动，仅移除狭窄滚动条的视觉挤压。

验证命令、结果及证据层级：38项模块通过；node --test --test-concurrency=1 tests/*.test.mjs desktop/tests/*.test.cjs，834/834通过，exit0。真实隔离Harness+原React壳16项UI交互，覆盖基线头像挤压复现、修复后完整点击区、断连/403/错误/已连空态、真实projection形状的状态/版本/搜索/筛选、原审阅地址、展开后原菜单和1024/390无横向溢出；模型调用0，共享3080写入0。PNG实际打开检查，不把测试数据当生产交付。原style.css与非交付业务页面继续由逐字等价测试保护。

QA修正留痕：原生折叠展开状态在reload后不持久；展开按钮文案是“打开侧边栏”；采图需等待原生侧栏CSS宽度动画完成；移动端切drawer时原按钮会消失，使用原Escape关闭而不是继续点击失效按钮。均为QA定位/采图时序修正，不篡改原生侧栏生命周期。失败日志和首次完整16项PASS记录保留。

副本回滚：源码原件由固定72e11b6获取，独立标记副本恢复原交付组件与compact样式并运行原context/team32项；修改源码保持。ZIP原件、源码hash、反向patch与ROLLBACK执行属性一并核验；结果见本模块VERIFICATION/ROLLBACK.log。

运行加载：仅client交付函数/一行分支、host新增CSS白名单与link、bot-sidebar.css增量、新CSS共四文件；运行host/client存在与main不同的既有增量，故禁止整份覆盖。独立部署脚本逐片段CAS、保留无关文件/配置hash和Bot/员工export，失败恢复原件，running=0后才调用原维护脚本。本机加载结果以DEPLOYMENT.json为准，不用Git合并替代。

未完成项与下一步：普通合入推送、窗口协调后四文件实际加载，再重开归档并清理本任务。发布安装包由并行更新闭环任务单独负责，本切片不改版本，不覆盖其desktop-updates/product-identity/native/0.3.9准备，不重发旧包。企业连接与真实业务权限仍由原服务负责，UI优化不自动连接企业。
