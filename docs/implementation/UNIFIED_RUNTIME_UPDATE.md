# 客户端与本地服务同源升级

## 模块与职责
负责人本线程；基线fc8a13bc12be779799b42e09e1f58e0b23f56a5f；隔离分支codex/unified-runtime-update-20261119；目录D:/NaumiBuild/unified-runtime-update-20261119。
文件归属：desktop backend/main/update-gate/preflight/relaunch、共用service-code/linked-service；现有更新UI、测试/修复脚本/证据。其他群UI线程不改。

## 调研与接口归属
截图为真实client0.4.1/service0.3.9。安装resources/backend已有0.4.1，APPDATA backend-link指向原workspace，external update明确不停止/更新服务，故多次升客户端仍接旧服务。
不伪改product-version，不迁移/复制账号、模型、Bot、记忆、Session。保留原home/.dsh及自定义插件（Codex/Claude插件不在官方bundle，整目录改成官方node_modules会丢功能，故不采用）。
复用原service-alignment SHA/CAS/原子写/回滚，抽为desktop/app/service-code.cjs，CLI仅重导出。固定安装包inventory校验3个内置Naumi插件与7个已知native extension文件；Harness/extension package版本不匹配则停止同步，不猜兼容。
明确迁移后的backend-link version2/serviceUpdates=bundled只表示该本机代码接受安装包更新；原身份绑定、原路径配置和数据文件不变。任意external或显式NAUMI_ROOT仍不被客户端接管。
已迁移的linkedService复用现有signed instance/maintenance receipt，版本变化先quiesce，忙或未知即延后；停止确切旧worker后原子同步整个内置服务代码，启动同home、同端口；不另造升级引擎。第一次从无身份legacy服务接续由同一native启动链执行：核验固定root/config/home、原PID文件、真实进程exe/命令行/创建时间/监听端口，前后两次owner活动读取全部空闲才接续；未知进程/额外任务/配置漂移不接管。旧服务初次接续属于空闲窗口迁移，后续受控服务使用原signed维护闸门。
安装preflight纳入明确迁移的home。桌面ready回执实际读取HTTP serviceVersion，installer completion必须双版本等于目标。

## 实现与迁移状态
模块集中100/100通过；真实旧服务0.3.9→随包0.4.1在隔离native Electron/main/IPC完成10项，两次GUI重启、同home数据/额外插件不变，原进程退出、新worker signed/owned；非模型fixture。准备0.4.2正式修复版本，源与服务标签一同升级。安装包新版本发布与源码merge分别留证，不覆盖公开0.4.1资产。

## 验证
BASELINE：backend/update-gate/updates/UI/service-alignment，69/69 pass，exit0，evidence/unified-runtime-update/BASELINE.log。

## 未完成与下一步
本切片已完成异常/恢复/升级/数据保持、真实原生包、当前legacy接续、四件套、main发布与正式安装。后续版本继续使用既有双版本/签名服务/维护闸门；本次不再重装或重启正式服务。
功能模块计数1。

## 集中验收完成
- 69项原基线通过；模块（含真正signed worker版本切换、活动任务不停止、原PID/端口拒绝错误进程、局部写失败回滚、过期锁恢复）100项通过；增加锁与0.4.2标签后全仓917/917通过，exit0。
- `node scripts/verify-unified-runtime-native.mjs`：10项实际Electron/main/IPC + 真实Harness检查通过；真实旧service0.3.9接续到固定安装资源0.4.1，同home/同端口，旧worker退出、新worker有signed identity；GUI正常退出会停止owned服务，重新启动保留原数据/额外插件；模型调用0。
- native首轮由于隔离资源使用junction，被源路径校验拒绝；修复为先canonical固定releaseRoot再核验完整inventory，目标写入仍拒绝redirect。失败fixture未碰3080。
- 新版本号客户端/package-lock/productVersion统一0.4.2；无公共0.4.1资产覆盖。当前真实用户114sessions/0running/0activeTasks（读时状态，不当作持续空闲保证）。

主线并入线程/Bot分离模块后，补齐同一包的native workspace visibility扩展到7个固定native模块核验/同步，防止新Bot侧栏只升级资产而漏原生扩展。

## 固定包验收
- 固定main563ca3d48aa978e31f091ba5330636cea21d5521构建0.4.2，exit0；45,659运行文件逐SHA核对、插件对固定source、asar main/updates/relaunch对固定source、private_paths0、closurePASS。
- 安装包495,525,862字节，SHA256 a40a5b694d2d6d5e02efe16006af64612760d729276301239a4067cdb25c1e61；稳定副本D:/NaumiReleases/0.4.2，CRC/字节复核。
- 实际完整packaged Naumi.exe在隔离home运行：旧外接0.3.9→0.4.2，双版本0.4.2、原home及自定义插件、signed worker退出/重开，共10项pass；常规新账号/内置服务/模型入口/钉钉离线/owned退出另一路真实package runner通过。
- hidden截图可能缺浮层，版本结论来自真实DOM+native IPC+ready回执，不把截图冒称用户当前桌面完成。helper首次误匹配带noCache的fixture feed及hidden screenshot timeout已修正runner；真实公开更新源未改动。
- 安装覆盖QA初次路径超过原66字符预算返回43，未装入；以显式独立D:/NaumiQA/i042短根继续，仍验证中文空格、HKLM/现有安装/快捷方式保持。测试驱动变化不进入已固定应用包。

## 正式发布、覆盖安装与原数据验收（2026-11-19）
- 最终整合全仓 `node --test tests/*.test.mjs desktop/tests/*.test.cjs`：927/927，exit 0；实际固定包旧服务0.3.9→0.4.2的10项Electron/Harness验收通过。前文917项和0.4.1资源为较早阶段记录，不代表最终交付版本。
- NSIS隔离currentuser槽实际安装0.4.1、覆盖0.4.2、卸载，三个进程均exit 0；原Session、记忆、人设和数据保持，正式HKLM/ProgramFiles/快捷方式保持。此槽已卸载；不是正式用户安装的替代证明。
- stable/latest v0.4.2已正式发布：<https://github.com/JesstLe/naumi-desktop/releases/tag/v0.4.2>。tag固定main `563ca3d48aa978e31f091ba5330636cea21d5521`，匿名HTTP206分段完整下载495,525,862字节后SHA256匹配；旧0.4.1资产不变。稳定安装包 `D:/NaumiReleases/0.4.2/Naumi-Setup-0.4.2-x64.exe`。
- 用户批准“现在升级”后，正常关闭原Naumi，运行上述固定安装包，以 `/allusers /S --updated /D=C:\Program Files\Naumi` 覆盖安装；管理员确认完成，安装器exit 0，自动重开正式应用。
- 正式 `C:/Program Files/Naumi/Naumi.exe` 的ready回执、进程和实际HTTP一致：clientVersion=0.4.2、serviceVersion=0.4.2、backendMode=managed；原 `E:/Workspace/naumi-desktop/.dsh` 不变。服务签名、bundleId、同步journal均核验通过。
- 升级前后121个受保护文件哈希相同；114个Session ID完全保持；Bot/群/任务/模型API投影哈希无变化；180个内置插件文件及7个native模块与安装资源一致，代码差异0，模型调用0。正式asar中32个顶层可执行/UI文件对固定main逐字一致；不扩展为所有嵌套源码都打包的结论。
- 10:37只读复核：正式客户端/服务进程存活、HTTP服务版本0.4.2、signed worker通过、121文件仍无变化、114会话保持、代码差异0。系统锁屏后不再执行UI输入；正式安装结论来自HTTP/进程/签名/安装及ready回执，不将锁屏图片当作产品截图。
- 四件套附逐文件原始/修改后SHA256；回滚仅在标记独立副本恢复17个文件、删除7个新增文件并通过原69项测试。活动源码和正式安装仍保留0.4.2；服务原码备份保留于原home下 `desktop-service-backups/`。
- 证据：`evidence/unified-runtime-update/{LIVE_AFTER.json,LIVE_RECHECK.json,APP_ASAR_FIXED.json,VERIFICATION.txt}`；`evidence/release-042/{PACKAGE.json,PUBLIC.json,INSTALLATION.json}`。真实Session清单、凭据文件哈希逐项记录等本地原始材料不公开提交；公开仅保留聚合计数与结果。

## 收口与协作状态
- 功能/验证脚本已普通merge到main；收口前fetch确认共享main与origin/main均为 `e17953ad44c0d404573262e0fc9d32e20f4262ad`，任务分支从1374939快进整合此主线。
- 本轮仅补文档和实际安装证据，功能迭代增量0，不改变已发布0.4.2固定包。任务提交合入main后删除本任务分支/worktree；其他任务与共享未提交材料保持。
