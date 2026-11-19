# 客户端与本地服务同源升级

## 模块与职责
负责人本线程；基线fc8a13bc12be779799b42e09e1f58e0b23f56a5f；隔离分支codex/unified-runtime-update-20261119；目录D:/NaumiBuild/unified-runtime-update-20261119。
文件归属：desktop backend/main/update-gate/preflight/relaunch、共用service-code/linked-service；现有更新UI、测试/修复脚本/证据。其他群UI线程不改。

## 调研与接口归属
截图为真实client0.4.1/service0.3.9。安装resources/backend已有0.4.1，APPDATA backend-link指向原workspace，external update明确不停止/更新服务，故多次升客户端仍接旧服务。
不伪改product-version，不迁移/复制账号、模型、Bot、记忆、Session。保留原home/.dsh及自定义插件（Codex/Claude插件不在官方bundle，整目录改成官方node_modules会丢功能，故不采用）。
复用原service-alignment SHA/CAS/原子写/回滚，抽为desktop/app/service-code.cjs，CLI仅重导出。固定安装包inventory校验3个内置Naumi插件与6个已知native extension文件；Harness/extension package版本不匹配则停止同步，不猜兼容。
明确迁移后的backend-link version2/serviceUpdates=bundled只表示该本机代码接受安装包更新；原身份绑定、原路径配置和数据文件不变。任意external或显式NAUMI_ROOT仍不被客户端接管。
已迁移的linkedService复用现有signed instance/maintenance receipt，版本变化先quiesce，忙或未知即延后；停止确切旧worker后原子同步整个内置服务代码，启动同home、同端口；不另造升级引擎。第一次从无身份legacy服务接续由同一native启动链执行：核验固定root/config/home、原PID文件、真实进程exe/命令行/创建时间/监听端口，前后两次owner活动读取全部空闲才接续；未知进程/额外任务/配置漂移不接管。旧服务初次接续属于空闲窗口迁移，后续受控服务使用原signed维护闸门。
安装preflight纳入明确迁移的home。桌面ready回执实际读取HTTP serviceVersion，installer completion必须双版本等于目标。

## 实现与迁移状态
模块集中100/100通过；真实旧服务0.3.9→随包0.4.1在隔离native Electron/main/IPC完成10项，两次GUI重启、同home数据/额外插件不变，原进程退出、新worker signed/owned；非模型fixture。准备0.4.2正式修复版本，源与服务标签一同升级。安装包新版本发布与源码merge分别留证，不覆盖公开0.4.1资产。

## 验证
BASELINE：backend/update-gate/updates/UI/service-alignment，69/69 pass，exit0，evidence/unified-runtime-update/BASELINE.log。

## 未完成与下一步
补齐异常/恢复/升级/数据保持、真实原生UI、当前legacy接续、四件套和main发布。
功能模块计数1。

## 集中验收完成
- 69项原基线通过；模块（含真正signed worker版本切换、活动任务不停止、原PID/端口拒绝错误进程、局部写失败回滚、过期锁恢复）100项通过；增加锁与0.4.2标签后全仓917/917通过，exit0。
- `node scripts/verify-unified-runtime-native.mjs`：10项实际Electron/main/IPC + 真实Harness检查通过；真实旧service0.3.9接续到固定安装资源0.4.1，同home/同端口，旧worker退出、新worker有signed identity；GUI正常退出会停止owned服务，重新启动保留原数据/额外插件；模型调用0。
- native首轮由于隔离资源使用junction，被源路径校验拒绝；修复为先canonical固定releaseRoot再核验完整inventory，目标写入仍拒绝redirect。失败fixture未碰3080。
- 新版本号客户端/package-lock/productVersion统一0.4.2；无公共0.4.1资产覆盖。当前真实用户114sessions/0running/0activeTasks（读时状态，不当作持续空闲保证）。
