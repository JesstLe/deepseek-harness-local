# 客户端更新闭环修复

## 模块与职责
- 本任务 `codex/update-complete-20261118`，独立工作区 `E:/Workspace/naumi-update-complete-20261118`。
- 基线 main/origin main `72e11b6a286bba8e11db90a0edeb32653301a52e`。用户要求一次性修复、发版并处理当前安装。
- 范围：desktop更新门禁/退出生命周期、preload版本事实、原生更新UI/产品版本显示、定向测试与真实更新runner、0.3.9版本/发布记录。共享3080、模型/员工/企业数据不迁移。

## 接口与状态归属
- 更新仍由electron-updater与标准NSIS执行；不新建安装器、不绕过任务/维护准入。
- owned isolated后端继续签名quiesce与精确停止。显式external链接只读核对会话/任务，冻结本窗口准入，不停止或替换共享后端。
- 共享原生quit gate的prepare阶段在启动安装器前完成flush/bridge/owned worker退出；第二次before-quit直接退出，不与安装器抢旧进程。
- Native版本由主进程app.getVersion通过BrowserWindow additionalArguments传入preload不可变字段；服务版本仍来自当前页面backend配置。两者分开显示，不改backend-link。
- 单连接下载失败保留错误并轮换默认源，不用busy冒充未知状态；UI展示安装准备阶段和明确失败。

## 基线与现场
- installed app.asar=0.3.7，backend-link指E:/Workspace/naumi-desktop，3080 PID46840自09:38:57未变；0.3.8更新包完整在cache。
- 实际安装源码隔离复现：legacy gate INSTALL_ACTIVITY_UNKNOWN→UPDATE_INSTALL_BUSY；quitAndInstall=0，backend维护调用0。主线有同样代码。
- 基线原模块73/73，exit0（不存在的旧UI测试文件不会计入）；后续集中验收使用实际文件清单。

## 验证与未完成
- 完整切片后集中测试；新增外部连接失败/忙碌/空闲、并发/重试、异步flush先于安装、版本指向和默认源轮换。
- 必须补真实Electron原生更新交接及NSIS退出→重开证据，不以人工安装或mock quitAndInstall代替自动更新证明。
- 完成固定main构建0.3.9后，保留原版本资产、数据与可逆证据，处理当前安装。当前尚未宣称修复或发布完成。

## 主线整合
- 已整合 origin/main effb693b6a7ba8a8067120c3a8566eae3f61b6bc，保留交付中心/折叠侧栏全部UI与证据；.gitattributes只并列保留两模块规则。
- 整合树集中测试843/843，exit0，含最终原生启动回执；原切片837/837。
- 新增实际原生自动更新runner：独立currentuser安装槽、公版0.3.8加修复候选代码（保留旧版本元数据），下载完整0.3.9真实NSIS，验证旧PID退出/新PID回执/外部后端与原会话保留，最终卸载fixture；该验收尚待构建后执行。

## 真实交接首轮与追加修复
- 首轮真实loopback完整下载及原生点击已执行，旧候选GUI退出，但HKCU/HKLM并存时stock静默分支仅凭hasPerMachineInstallation就转机器安装，新GUI未重开。首轮保留HANDOFF_FIRST，不混记通过。
- 最小扩展：native updater公共installDirectory绑定process.execPath目录；NSIS现有customInit仅针对--updated且显式/D匹配已注册安装目录，选择对应现有安装范围，未知目录exit43；未修改stock引擎/卸载事务/依赖版本。
- 追加修复后定向100/100通过，exit0。需从包含修订的固定main重建0.3.9并复跑真实交接。

- 额外真实NSIS无安装参数观察器确认：Node spawn会将含空格/D参数整项包引号，pinned GetDParameter保留尾引号。customInit仅去除末尾包装引号、仍以canonical+注册目录精确匹配，并将INSTDIR设为检查后的路径，支持中文/空格。原始观察输出归档ARGV。

- 第二轮已成功安装最终0.3.9（实际asar版本确认），但Explorer启动不继承测试进程env，隔离profile的回执门未满足；该轮作为验收夹具失败保留HANDOFF_SECOND，不计生产重开PASS。原生runner为自有临时开始菜单快捷方式增加仅夹具的context launcher，仍由NSIS自动调用，生产app.asar不改；不改真实账号/系统env。

- 第三轮NSIS已自动创建新GUI PID53976，renderer原生参数为0.3.9且userdata为隔离profile；因夹具登录仅session cookie，退出后identity分区Cookies表为0（只读SQLite计数确认），工作台回执未满足。保留HANDOFF_THIRD；fixture登录改为Max-Age=3600再验收，不改变产品登录策略。
- 副本回滚增强为从整合HEAD复制，再仅恢复本任务20文件；额外断言协作UI的host/client/两份CSS逐字保持，不回退其他线程UI。

## 最终真实链路与当前用户处理
- 完整native handoff PASS：old PID56848退出→stock updater真实下载495316892字节/SHA512→NSIS实际替换→生产0.3.9 PID39500工作台回执；外接Harness、原Session与数据保持，fixture卸载及HKLM/原快捷方式保护通过，0模型。
- 稳定发布v0.3.9，tag固定1602a1d；匿名30段HTTP206完整下载SHA256/SHA512吻合，旧0.3.7资产保持。
- 当前用户一次性currentuser安装使用同一APPDATA和原backend-link；部署脚本修复PowerShell单进程JSON边界，并增加带原快照/原backend PID/原配置hash复核的resume-closed。原TypeError与WAL门失败保留，不混记通过。
- employees.sqlite-wal是运行态旁路文件，实测后台改变但稳定DB/任务/配置字节保持；不重写或checkpoint真实DB，业务保护以原员工export hash+稳定文件hash核验。实际安装正在执行，最终以USER_INSTALL回执为准。

## 最终状态（覆盖前文历史待验收项）：完成
- 固定main `1602a1da4bafdc2bb104d13209e7d40c30f9cc85` 的0.3.9正式发布；495316892字节，SHA256 `6964b33317eb86324fef7a097d883f911253f00d3c9a19cfa667779f2222630e`。保留effb693 UI、D3/D4/导入/创作与此前安装器修订。
- 最终固定源码全仓844/844、实际packaged owned后端/更新入口/Bot主聊天、真实native下载→NSIS→重开全部通过；此前失败独立留痕。旧版本号修复候选的真实链路为PID56848→生产0.3.9 PID39500，原生Session/外接服务存活；fixture卸载及原注册表/快捷方式复核通过。
- 当前用户旧0.3.7 PID33724已退出；支持的currentuser正式0.3.9在 `C:/Users/13357/AppData/Local/Programs/Naumi/Naumi.exe`，PID8660，真实可见Naumi窗口/生产工作台回执/ASAR匹配固定包。用户桌面与开始菜单均指向该安装；原系统级0.3.7文件/注册表/公共快捷方式保持，不把它当作当前入口。
- 同一APPDATA/身份Cookie/原backend-link保留；共享3080仍PID44844、不重启；106sessions/0running/4bots/revision47，原Bot/任务/员工export hash一致。243稳定权威数据/配置、154无关运行文件保持；只热更新两份静态更新/身份资产（HTTP200/no-cache/hash一致）。原模型/企业配置不变，0模型调用。
- 四个SQLite WAL中仅employees.sqlite-wal随运行后台变化，按运行态单列；其余WAL逐字保持，稳定DB和员工逻辑export一致。没有真实DB checkpoint/迁移/恢复写入。
- 四件套位于 `evidence/update-complete/`，ZIP保留20文件原始/修改字节及SHA；从整合源码副本仅恢复本任务文件，另核对协作UI host/client/两CSS不变；恢复原0.3.8门禁行为、73/73通过，当前修复与真实安装保持0.3.9。ZIP CRC、Git/ZIP执行位、bash语法、四件重开均核验。
- 完整证据：VERIFICATION.txt、HANDOFF.json、PUBLIC.json、USER_INSTALL.json、USER_FINAL.json、USER_REGISTRY_SHORTCUTS.json、FINAL_FULL_FIXED.log、ROLLBACK_RESULT.json。原始fixture token与无关业务文件名清单只留本机private diagnostics，公开证据单列脱敏清单及原SHA。
- 本更新切片无剩余必需验收；当前客户端保持打开。主线证据普通合并推送后清理本任务短命分支/worktree，不再重启或发模型；后续产品愿景不并入本次完成口径。
