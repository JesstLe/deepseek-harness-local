# M5 员工安装包接续

状态：M5.1 正式包闭包与钉钉预装、M5.2 桌面实例与依赖生命周期已通过模块/实物包/unpacked桌面验证；远程企业首次连接、业务数据迁移与完整安装验收继续。2026-11-17。总目标active。

## 接续时的源码基线（M5.1 的变化见下文）

- `desktop/package.json` 为Naumi 0.2.0，Electron 44.11.3，NSIS x64；桌面窗口、安装器、卸载器及快捷方式都配置 `app/assets/naumi.ico`。
- `desktop/scripts/prepare-runtime.mjs` 目前复制Node、依赖、插件、干净profile/home默认配置，不以个人home/logs/credentials为源；但布尔manifest不是内容扫描证据。
- 原生Chromium webview、agent-desktop桥接、桌面IPC已有实现及回归；不是靠截图轮询模拟浏览器。
- 旧打包验证脚本覆盖打包版启动、独立userData、无开发工具PATH、内置浏览器和未打入CC个人凭证；不等同当前M1-M4代码已进入最终安装包。
- 当前prepare-runtime未加入钉钉CLI专用bundle、安装/升级数据迁移清单和完整企业首次登录引导。主进程登录窗口仍专门匹配本机3112，需与可配置企业服务端统一。

## 必须完成的退出项

1. 冻结可重复构建的应用版本、Node/依赖/原生模块与插件清单；包含已验收的M1-M4客户端代码，模型网关主Key/服务器私钥不进员工包。
2. 钉钉CLI真实分发/依赖/许可证/可执行性探测与工具注册；区分已内置、已连接、已授权和健康。首次用户账号授权仍由账号本人完成，不复制开发者登录态。
3. 新员工首次使用只完成企业连接与账号验证；设备登记、绑定、签名pin与服务端下发模型URL/短期凭证使用已有权威协议，不写共享个人Key。服务端地址具备明确配置来源，不硬编码开发机localhost。
4. 干净profile、默认浅色Naumi UI、Logo/图标/快捷方式、原模型位置、原生浏览器与桌面能力；不携带开发会话、真实Bot、员工私人记忆、cookie或浏览器资料。
5. 升级/旧版数据迁移、失败恢复/版本回滚、卸载保留员工数据，记录每个版本的schema和hash兼容性。未知执行不因安装/升级而重放。
6. 生成实际NSIS安装包并检查签名/来源状态；在隔离干净员工环境执行安装、首次启动、无开发PATH、企业fixture登录/授权/模型策略、浏览器/桌面/CLI、升级和回滚链；最终再次核验真实企业连接目标与员工业务使用。
7. 安装包内容解包扫描、Logo资源检查、供应链/许可证清单和逐文件hash；原始基线与四件套、副本回滚、构建/运行/安装/真实使用证据分层保存，选择性Git提交推送。

## 真实外部验收项

当前3183网关0真实供应商路由，现有真实员工设备未登记。供应商路由/合同定价/负责人预算和真实企业部署地址与账号须以实际配置验收；本机test租户和虚拟上游可验证协议，不能替代这些事实。其间仍继续推进上述构建、登录链、CLI内置与安装迁移模块，不将目标缩减为一个可启动exe。

## M5.1 正式包闭包与预装 CLI（2026-11-17）

### 实现

- 修复 npm `files` 遗漏的 activity/store/capabilities/observation/runtime gate/policy/models/proactive AI 模块；保留既有显式文件清单，增加完整 AST import 与 npm pack 实物闭包门，未来漏文件会在构建前失败。
- 声明直接使用的 llm-pi-ai、mcp-client、schedule、skill-filesystem、tool-executor-native 和 pi-ai peer；不依赖偶然的传递解析。Acorn 8.19.0 作为明确构建依赖，复用锁文件已有版本，不在共享根依赖目录安装。
- 固定官方 `dingtalk-workspace-cli@1.0.68` 的 npm SHA512、Windows x64 归档 SHA256 和 dws.exe SHA256；只提取目标平台二进制、标准 launcher、LICENSE/NOTICE/README/CHANGELOG，不执行 npm postinstall，不安装上游全局 skills。
- 后端 PATH 前置内置 `bin/dws.cmd`，它调用内置 Node 与本应用 launcher；不依赖开发机 PATH 或全局 CLI。应用受管 shell 仍经过原有工具审批及运行门。本次没有新增一个绕过审批的业务执行 API。
- 清除 inherited DWS/DINGTALK/其他供应商凭证和 endpoint override，使用员工自己的 `DSH_HOME/integrations/dingtalk`，禁用更新检查、使用追踪与全局技能安装。
- 实测发现官方 exe 会在自身目录释放原生 DLL/config/lock；因此先校验并复制到员工自己的 `home/runtime/dingtalk/version/hash`，再启动。安装 resources 保持不可写且哈希不变；不同员工/版本缓存独立。拒绝受管子目录 junction 与损坏 exe。
- 能力清单用真实 `auth status --readonly --format json`，固定参数、超时/输出上限，不回传账号详情；已内置、健康、本地有登录信息与远端在线权限分列，`connected=null`、`networkVerified=false`。技能强调精确写操作审批、未知结果核对，安装不等于企业授权。
- staging 在全新临时目录构建；只输入依赖/插件/干净默认模板，执行离线 host import、逐文件 SHA256 与个人状态路径检查。通过后才发布，旧 bundle 留作回滚。electron-builder `beforePack` 重验完整 inventory 与当前源码，拒绝陈旧/追加/损坏文件；默认 build/build:dir 都重新 stage。

### 已有验证与边界

- 原始基线 251/251；新增 17 项后 268/268。覆盖 tarball 篡改、缺失/越界 import、依赖声明、缓存损坏/junction、凭证环境剥离、能力状态与私有文件路径门。
- 正式 npm 包 71/71 文件、离线 host import、70,359 文件 staging hash 与私有状态路径门通过；Node resolve hook 拒绝从祖先工作区补依赖，实测无开发依赖回落。真实 dws 版本/schema/auth readonly 与干净员工配置通过，installed/healthy=true、authenticated=false、networkVerified=false。
- 实际构建 Naumi.exe（unpacked）并在独立 userData/3082/纯系统 PATH 启动，内置 Node、Chromium 原生侧栏及钉钉 CLI 通过；资源目录未被 CLI 自解压写入。Logo 保留已有8处配置与7档ICO。Electron内置Node24.22.2与后端独立Node24.19.0分别记录，不混称同一runtime。
- 构建没有配置代码签名证书，签名步骤按builder输出跳过；本地desktop依赖安装记录有6项moderate审计提示，没有执行自动升级或audit fix。发布前供应链/签名审查仍在完整M5出口，不因本轮unpacked通过而关闭。
- 副本回滚恢复 11 个原始文件（含证据字节保留属性）、移除 10 个新增文件；251 项原行为通过，样例 persona/memory/schema 保留，实际服务与数据未动，工作区新实现保留。
- `evidence/employee-package` 持续保存正式 npm 包实物/CLI/桌面构建证据与四件套。大归档、二进制研究缓存、独立账号与回滚副本均精确忽略，不进入 Git。
- **本轮不是 M5 整体退出。** 远程企业 origin/主进程 session bridge、同 Logo 服务的实例身份与端口隔离、依赖 junction 升级、数据迁移/版本回退、真实 NSIS 安装/升级/卸载链、员工本人授权和真实业务使用仍待后续模块。没有把打包版启动替代安装验收；没有向真实员工登记或启用主动 AI。

### 复用开发提示

```text
接续 M5.2：先核对 docs/prd/GOAL_TRACKER.md 与本文件的未退出项；
只在 fix/naumi-bot-lifecycle-20261116 的隔离树开发。
保留浅色 Naumi UI、左侧导航、模型位置、原生 Chromium 和既有审批/运行门。
远程企业 cookie 只由 Electron session 发往配置 origin，不交给 renderer/backend。
先修 profile 实例身份/端口/受管 junction，再做首次连接与升级迁移。
逐模块更新文档、集中测试、四件套与副本回滚，区分 unpacked/NSIS/真实员工验收。
不要改真实员工设备、私人同步或主动规则；网关 routes=0 不是模型业务验收。
```

## M5.2 实例与依赖生命周期增量

293项集中回归、268项副本原行为、72文件正式插件包、3个ASAR关键模块及6份resource源码hash一致性通过。真实unpacked桌面双profile/同Logo不误附着/动态端口、独立工作区、原生浏览器cookie持久化与跨profile不泄漏、正常重启、实际Electron主进程硬杀后原backend PID接回、接回后认证停机通过。原人物设定/记忆/schema1和UNKNOWN样例保留。处理了首用工作区隐式Documents依赖、引导URL就绪竞态、Windows非detached job、退出重入与Host压缩层丢弃end回调等真机问题。

源码和故障矩阵详见 `DESKTOP_LIFECYCLE_M5_2.md`；证据 `evidence/desktop-lifecycle/VERIFICATION.txt`。实际3080未替换，员工/设备/上传/AI规则未自动操作。依赖链接回退不是已安装程序跨schema降级；远程企业session桥/首次连接、NSIS安装升级卸载、业务数据迁移/版本回退、签名与供应链、真实员工与模型验收仍继续，完整目标active。

## M5.3 企业首次连接与归属

新增首次企业origin配置、独立Electron企业session与有限业务请求桥；Cookie不拷贝到localhost，原设备签名/同步/运行门保留。实例协议2绑定listener port/homeHash/企业origin，拒绝relay和隐式home克隆，保留旧identity UUID/key。修复干净PATH下DPAPI shell发现和Windows回执短暂占用。315项本地回归通过；正式npm包73文件、候选产物/双profile登录/原生浏览器与故障恢复/副本回滚最终证据统一见evidence/desktop-enterprise/VERIFICATION.txt与DESKTOP_ENTERPRISE_M5_3.md。下一NSIS真实安装、已安装版本/业务数据迁移回退、签名/依赖和真实员工业务验收；完整目标active。

## M5.4 工作区恢复与 NSIS 候选

0.2.1新增可恢复首次连接及独立企业工作区，原home/identity/private store/原生浏览器资料不覆盖；有活动任务或未知活动状态不切换，旧worker认证退出后才选新home。正常启动不依赖企业在线。333回归与实际workspaces/NSIS/产物/副本恢复最终结果见evidence/desktop-installation/VERIFICATION.txt，细粒度边界见DESKTOP_INSTALLATION_M5_4.md。NSIS正常停机链不代表硬杀孤儿worker或跨工作区旧版降级已完成；总目标active。
