# 旧链接服务模型选择器升级闭环

模块与职责：本线程负责 linked-service 原生文件同步与分发验收，不修改账号、供应商字段、浏览器/CUA、IM 或当前运行服务。任务分支 codex/linked-model-picker-20261120；基线 main/origin/main 95f6abdceb7bfc54a0b8d9b1b2b9bed6d9c26174；功能切片1。

公共接口、依赖方向、数据/状态/事务归属：沿用 linked-service.plan/synchronize/recover 和现有 acquire 锁、签名 maintenance running=0 门。UI文件作为代码同步，配置/会话/凭据仍归原 home；安装包本身不带用户数据。

调研：用户实际客户端/服务均0.4.8，backend-link v2 serviceUpdates=bundled 指向原 E 工作目录。安装包内原生 picker hash51ce0568，但活动目录仍124c4f0f。旧 nativeFiles 少了 model-selection，版本/其他模块对齐不能证明该文件同步；原门禁只有 isolated home，漏 linked 运行路径。

本次实现与迁移状态：
- 把 dsh-client-ui-model-selection/lib/client.js 纳入现有原子备份/应用/回滚，不增加旁路补丁，不改displayName。
- release 校验自动检查 runtime inventory 内每个 .naumi-original 原生扩展都在同步清单，未来遗漏即在任何写入前报 SERVICE_NATIVE_EXTENSION_UNTRACKED。
- 单元独立点名模型选择器；同版本残旧文件仍检查hash，失败回滚保留凭据，重试幂等。
- 真实安装包门禁增加 linked-legacy：复制上一版完整依赖为隔离旧服务，旧picker恢复上游源码，先真实0.4.8启动并复现标题；同home/账号/端口/Cookie与缓存升级后核对实际加载目录hash，验证Bot/普通/群聊与选择刷新。
- 发布门禁必须收到四配置/十二场景及linked活动文件hash回执，旧三配置回执不得放行。
- 修复版本0.4.9，仅完整固定main构建后发布，不覆盖已发布0.4.8，不热改运行目录。

验证命令、结果及证据层级：待本模块集中验证后更新；证据根D:/NaumiReleases/0.4.9。

未完成项与下一步：定向/全仓、固定main构建、真实linked EXE链及更新源验收、四工件副本回滚。当前用户安装与运行服务保持原状。

集中结果：17/17定向exit0；全仓首轮1095/1096，唯一CUA_BUNDLE_MISSING为新worktree未带ignored固定驱动，已从既有完整包核对固定hash后补齐独立树驱动，最终1096/1096 exit0，首轮日志保留。四工件基线picker_synced=0/headings=3，修改=1/0，副本rollback=0/3，凭据保持，三次exit0。真实安装包尚待构建验收，不冒称当前用户已生效。

## 完整包与发布验收
- 固定main 13b47cdbd9a2170a789b12379c759ae69499729e；完整 npm --prefix desktop run build exit0，包含强制真实EXE门禁，不只生成安装器。
- 实际安装器EXE/asar/UI提取hash一致，四配置×十二场景、27检查PASS；linked-legacy先真实0.4.8复现标题，同home/账号/端口/Cookie升级0.4.9后实际活动UI hash=51ce0568c16e44a5df0aaf91582e44af34f267120df7d158327fd1b729560880，Bot/普通/群聊与选择刷新/凭据引用保持。8次loopback、0真实供应商、0pageerror。
- 实际用户目录仅只读plan，确实仅原生选择器1差异，pluginChanges=0、productionWrites=0，未热补/重启当前服务。源码测试允许上游SDK已经过受管同步的情形，通过反向固定扩展取original，不让以后本机升级导致源码测试误报；5/5定向exit0。
- 标准包static9检查PASS，installer504646222bytes SHA256=564cd186b84e555eddf3d5e49efebc4fc54db8d6c23cd96204d30eb052dd56ba。
- 官方publish脚本 --skip-build --target 13b47cdbd9a2170a789b12379c759ae69499729e exit0，https://github.com/JesstLe/naumi-desktop/releases/tag/v0.4.9 已发布；公开匿名latest.yml HTTP200、tag/Latest/资产digest/大小/文案逐项回读一致。镜像429保留、直连回退可用。独立归档校验脚本首次缺yaml解析依赖exit1，改用固定包自带yaml后exit0，失败日志保留。
- 旧三配置回执实际被 MODEL_PICKER_RELEASE_GATE_REQUIRED 拒绝；本次四配置linked活动hash回执通过。自动capturePage图片不是标题验收依据，不以其代替实际菜单DOM与活动文件hash。
- 四工件源代码副本rollback已恢复旧行为及原hash；产品事务失败回滚与重试另有定向测试。包/源码保持修改状态。源始末及精确命令/输出在稳定VERIFICATION.txt；发布完成不等于当前用户已安装0.4.9。
