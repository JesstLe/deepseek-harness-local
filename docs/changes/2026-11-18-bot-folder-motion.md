# Bot 文件夹合群动效

模块与职责：按用户“像iPhone App合并成组”要求替换拖动目标的文字提示，仅bot-sidebar.js/css展示。基线main/origin6d861b8b784d6e40084445df50e9245abb7c8c18；独立codex/bot-folder-motion-20261118。群创建/加成员、排序、操作UUID、原生输入器、权限、记忆和模型完全沿用，不改后端。

公共接口与状态归属：复用原dragging/drop/原Avatar组件；hover时只为目标添加staticPreview缩略图，不启动另一套动画引擎，不新增执行链。原头像保留挂载，使用opacity/transform让位；preview绝对定位，不占布局，不改变24%边缘/中间落点。原生dataTransfer.setDragImage只取当前头像，不再拖动整行文字。保存成功后仅给返回的真实群ID标记一次640ms生命周期的回弹，失败/取消/移开不伪造群或修改数据。

本次实现：取消“松开建群/加入群聊/+”覆盖提示；目标头像缩入浅色文件夹、当前Bot与拖入Bot以2×2缩略图吸入，4位以上角标人数；源头像浮起、轻微倾斜；群创建或成员加入成功后原群头像回弹。原上下插入线及多选保留。折叠侧栏34px预览，完整侧栏46px；prefers-reduced-motion关闭弹性/旋转动画，仍有静态可见合群反馈；定时器卸载清理，预览取消后原Avatar继续原生命周期。

验证命令、结果及证据层级：node --test tests/bot-folder-motion.test.mjs tests/bot-drag-groups.test.mjs tests/naumi-unified-chat.test.mjs tests/naumi-bot-groups-http.test.mjs tests/naumi-group-rename.test.mjs，28/28通过。node scripts/verify-bot-folder-motion.mjs：真实隔离Harness+Chrome鼠标24项通过，覆盖旧文字基线、原排序/群链路、多选/丢回执同UUID重试/Session保持/私聊草稿，以及预览2格原生Avatar、无文字提示、不移动命中区、取消还原、成功回弹、失败不伪成功、折叠尺寸、reduced-motion。截图folder-hover.png/folder-compact.png已实际打开检查。无模型调用、无共享3080或真实群写入。此前QA失败日志保留：同一次native拖动中截图/跨区域移回不稳定，改为独立取消与新拖动；回弹事件等待浏览器animationstart；折叠拖动改用实际按钮命中坐标。没有为测试修改生产落点业务。

交付边界：本轮为动效切片，不改版本、不安装客户端、不重发安装包；实际加载与源码合入分别记录。

部署复用：仅给既有deploy-bot-drag-groups.mjs增加显式--folder-motion profile，允许侧栏2资产、断言2文件，默认6文件行为不变；仍复用service-alignment的hash/CAS/原子写入/恢复与业务和配置前后核验，不新增服务编排器。

主线与集中终验：功能70c228a；整合fa48dec后44/44相关测试通过（含原群/Avatar外观）；普通合入推送main3f39e371b5ae9f582eb21b312099189b7962eb8b。随后整合74423b8的owner任务证据，仅docs/evidence差异，保留对方.gitattributes条目。业务功能迭代1，文档0。原3份仓库canonical Git原件与SHA256见manifest；源码副本恢复3文件后旧24测试通过；portable ZIP8项CRC/恢复3文件hash通过，实际改动保留。

运行加载实况：2份侧栏资产CAS写入，服务PID45444重启后HTTP200。首轮部署命令exit1：post-load/catch空闲门遇到并发真实会话LIVE_RUNNING，107会话增加至108，后续109/revision48且2running；没有强制回滚/追加重启。不会把该轮写为clean deployment或声称业务数据hash未变。只读复核exit0：两份实际HTTP资产SHA256与main完全一致，RUNTIME_PLAN全部170代码文件匹配目标，其中168无关文件保持原字节，service0.3.9不变。以DEPLOYMENT_AUDIT.json和LIVE_HTTP.log为实际加载证据；未获得完整业务hash保持门，因并发活动不能补称通过。本任务没有发模型、写真实群或重放任务。

最终状态：文件夹动效源码合入、两资产HTTP实载完成、独立原生壳24项动效交互完成；共享Git/3080已工具释放给协作线程。未完成项：新安装包不属于本轮，尚未构建；正在进行的真实会话保持运行，不为动效重新停服。四项交付见evidence/bot-folder-motion，复原仅在标记副本测试，不撤回已加载动效。
