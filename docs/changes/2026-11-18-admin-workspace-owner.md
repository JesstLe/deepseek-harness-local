# 管理员默认所有者导致首次启动失败

## 模块与职责
- 任务分支 `codex/admin-workspace-owner-20261118`，基线main/origin main `6d861b8b784d6e40084445df50e9245abb7c8c18`。
- 只修复managed-workspace PowerShell/CJS、对应测试和可分发热修复；不改Bot/group/设置等并行模块，不重启共享3080，不重装用户客户端。

## 根因与接口归属
- 原PS只接受TokenUser拥有的新空staging。管理员进程的TokenOwner可能是Administrators，NTFS默认采用该SID，因此报OWNER_MISMATCH；不是安装位置F盘本身错误。
- 新策略只接受当前TokenUser或当前token实际默认Owner；不是笼统接受Administrators/Everyone，也不迁移已有工作区。
- 原目录边界、空目录、reparse检查、失败不发布、只增当前用户WRITE_OWNER规则保留；前后目录所有者必须完全一致。
- PS输出UTF8；CJS只将稳定错误码交给启动UI，原异常留在cause，不把整条命令与乱码拼入用户提示。

## 验证与交付状态
- 修复前已有5测试通过，包含真实restricted-token写入/外部/兄弟/DACL负向；旧测试未覆盖管理员默认Owner。
- 将新增真实PS5策略分支测试，覆盖token默认组与非默认管理员组拒绝；本机非提升token，不将策略夹具记为真实远端Administrator验收。
- 待集中回归、定点热修复包/副本应用及撤销测试、四件套和主线收口。远端F:/Naumi实际安装未直接访问。

## 切片验证
- 实际生产PS guard同一SID夹具：baseline拒绝OWNER_MISMATCH，修改后token-default接受；实际PS5运行7种SID组合，非默认Administrators/Everyone/其他用户保持拒绝。
- 当前非提升用户的真实Windows restricted-token写入/外部/兄弟/DACL负向通过；不把该结果记为远端Administrator真机验收。
- 全仓870/870（末次新增CLI测试之前），热修复模块12/12；之后补实际分发PS5 APPLY/ROLLBACK+bundled Node中文空格路径4/4通过，原manifest/hash/保留数据复原。
- 定点包只匹配已知0.3.9的两个managed-workspace文件，两份插件副本+runtime inventory/manifest共6文件，备份CAS/关闭进程门禁/幂等重试/撤销；不触碰AppData，不自动重启。提供REPAIR-F-Naumi.cmd便于目标F盘机器执行。
- 待最后集中回归、四件套重开及普通main合入。
