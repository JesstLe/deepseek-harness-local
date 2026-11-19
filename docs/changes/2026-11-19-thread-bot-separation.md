# 线程与Bot归属分离

模块与职责：`codex/thread-bot-separation-20261119`，基线main/origin `7fc49e10dc48f50c8c905f4ce1f64765964df323`。Bot侧栏/模型、native workspace最小只读扩展及stage/sync安装点、隔离测试/文档；不改模型、任务后端、消息账本、企业权限、安装器/版本和当前固定0.4.1包。

公共接口、依赖方向、数据/状态/事务归属：现有workspace没有列表visibility接口，只有装饰/菜单slot。新增作用域内 `uiWorkspace.registerSidebarVisibility(source)`，source为 `{getSnapshot,subscribe}`，快照为 `{waiting,sessionIds,workspaceIds}`。原生WorkspaceBrowser仅在最终render和搜索结果派生处消费，不修改sessions/workspaces/store、account排序、retain、面板和draft。卸载注册释放订阅并恢复默认，多个贡献取并集，不使用全局拦截或DOM隐藏会话行。依赖字节hash锁定、逆变换/幂等、原件备份。

调研：原导航是portal+原树显示隐藏，因此线程枚举全部原生Sessions。Bot复用同一会话数据链路是正确的，但线程列表需要业务归属投影；不是把记录移动到另一个数据库。此前“Bot归档后仍在线程可见”旧契约由本次用户要求取代，提供已归档Bot入口保留历史可达性。

本次实现与迁移状态：从Bot目录的home/sessionIds、后台任务精确源/目标、群成员会话和原生parentId/实际team members递归得到归属，不猜标题/文件夹名字。共享cwd只过滤Bot会话，存在普通会话时保留工作区；没有普通会话的Bot专属工作区不出现在普通线程树。分类未读到时不先泄漏Bot会话。线程搜索/平铺/分组/归档过滤共用同一native投影。切回线程恢复最近普通会话或工作台，不停留Bot主聊天；直接打开Bot会话自动选Bot模式。Bot内已归档列表可打开旧主聊天和任务。

验证命令、结果及证据层级：改动前 `node --test tests/naumi-bots.test.mjs tests/naumi-bot-main-chat.test.mjs` 31/31 exit0；完整切片后集中模块+实际隔离Harness/Chrome+副本回滚，具体结果待补。

未完成项与下一步：模块回归、原生框架/数据入口验收、精确回滚/Git与运行加载协调。当前0.4.1构建另线程固定，不要求改包；本任务不碰共享依赖/3080，先隔离验收。迭代计数1。


## 集中验收
- 模块54/54；全仓首轮917项916通过，唯一失败是文件夹动效的“group model逐字不变”保护；已取消对bot-chat-model的修改，归档列表使用薄数据适配，最终全仓917/917 exit0，保留首轮失败。
- 真实隔离Harness/Chrome 17项通过：普通线程显示，Bot历史与专属workspace不出现，Bot点开原home，切回原普通Session，两侧原生draft保留，Bot任务页仍可打开旧历史，线程搜索/单列表/工作区树/刷新均分离，原群入口保留，0模型/0共享3080写入/0pageerror。生产native workspace完整模块按hash检查后在实际模块URL替换为同一扩展字节，未伪造store/列表/会话响应；企业workspace401仅UI夹具不连接企业。
- 原生上游把模块合并且去掉sourceMap注释，runner最初whole-file/独立文件匹配失败，修正成校验原模块完整主体后替换；browser未安装默认headless shell，改用已安装Chrome；workspace/list不存在，改用幂等workspace/create取得既有workspace。原树分组默认折叠/隐藏Bot目录被过宽locator计入导致前期误判，已限定原生thread child并按真实展开操作验收。
- 一轮runner连续点Bot切换+其他Bot过快触发上游released reference console，最终按每次原生会话就绪再下一操作验证通过；未把该前轮记0console errors，也未修改或替换原生会话管理。
- native接口仅向Sidebar传递过滤后的只读副本，不更改原sessions store、account排序和retain，不复制组件/基础交互。未做真实群/任务/员工数据迁移。
- 已整合fc8a13b的0.4.1发布证据；0.4.1固定产品7fc49e1不追加本功能、不重构安装包。待本切片完成回滚/普通merge后，仅空闲门下2资产+native1文件加载。

## 源码交付状态
- 已完成源码/917全仓/54模块/17原生框架UI。13任务文件原件与修改件SHA256、ZIP/差异与标记源码副本rollback31/31均通过，恢复混合列表旧契约，活动源码保持分离；运行态以独立DEPLOYMENT.json为准，不把Git合入当实际加载。
- 只加载Bot两资产和workspace native一个文件；由于原生模块批次缓存，需空闲门下一次服务重启。0.4.1固定包/EXE/native Electron当前进程不改，客户端刷新后获取新的服务资产。
