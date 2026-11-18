# 群聊工作成员状态栏

模块与职责：在群聊原生输入区上方固定展示当前群的活动Bot，不依赖侧栏是否可见。基线main/origin ab34d8343d5bc417e7b54d1a626943e2e84cbf0f，独立codex/group-work-indicator-20261118；仅assets/bot-groups.js/css、bot-chat-model.js及本任务测试/脚本/文档。功能迭代1。与0.4.0发布线程协调，不改其固定包或版本，不重启共享服务。

公共接口、依赖方向、数据/状态/事务归属：读取已有当前群GET结果room/posts/tasks；长任务以原任务账本projection为准，群即时回复以原reply.state为准。前端再次用该群成员sourceSessionId限定任务、精确botId+sessionId限定回复；不会把同Bot其他私聊的运行混入群。按Bot去重，同Bot多任务计数。无新表、无新写入、无供应商调用、新轮询或第二套执行/输入器。

本次实现：新增纯投影groupWorkMembers，稳定去重排序，终态自动移除。WorkIndicator复用原Avatar staticPreview，CSS轻微呼吸与三条工作波形，仅执行/准备/回复时动画，排队/待确认静态不同颜色；多Bot换行并限制独立滚动高度，窄屏适配；减少动态效果关闭动画。读取失败明确状态待同步并停止动画，401/403沿用原清空。点击单任务进入原worker Session，多任务复用原任务抽屉；群回复打开精确成员Session。原NativeComposer仅增加稳定前置workStatus节点，原SessionProvider/native factory/transport/binding/草稿/发送/停止/附件/模型状态生命周期完全不复制、不改写。

验证命令、结果及证据层级：node --test tests/naumi-group-work-indicator.test.mjs tests/naumi-group-collaboration.test.mjs tests/naumi-unified-chat.test.mjs tests/naumi-group-rename.test.mjs tests/naumi-bot-groups.test.mjs tests/naumi-bot-groups-http.test.mjs tests/service-alignment.test.mjs，48/48通过。node scripts/verify-group-work-indicator.mjs：真实隔离Harness/原生SessionProvider/InputBar与Chrome鼠标20项通过，含12人/360px/全部任务入口、等待与排队不动、断连标记、不串群、工作完成收起、原生编辑器DOM身份及草稿保持、单任务精确打开、停止基础链未改。首次19项后增加总数入口，最终20项；2张实际截图已打开检查。确定性HTTP投影夹具、0模型、0共享3080写入，不是供应商业务验收。原3文件副本基线41项通过；恢复3原件/删除新增部署脚本后41项通过，portable ZIP9项CRC与原件hash通过，实际修改保留。

未完成项与下一步：模块/浏览器验证、源码副本回滚、普通merge/push、只读资产热加载和HTTP字节验证。不会把确定性任务夹具当真实供应商长任务验收；不在群状态条伪造进度百分比。

部署调研与实现：host.js按每次GET readFile，Cache-Control:no-cache，静态3资产无需服务重启。新增薄脚本deploy-group-work-indicator.mjs复用service-alignment hash/CAS/atomic/rollback，强制model→CSS→entry顺序，失败按entry→CSS→model撤回，保护无关代码/6份配置与原生composer hash，PID前后相同。仅从干净固定main加载，不以running=0为只读前端资产必要条件，不暂停真实任务。
