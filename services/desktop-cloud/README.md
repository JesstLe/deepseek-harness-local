# Naumi Desktop 47 个人云数据

账号权威为 `https://47.105.59.142` 现有 `/api/auth/*`，本服务不存密码、不另建账号库。市场和云数据共用一个轻量 Node24 进程，数据分别在 `market.sqlite`、`cloud.sqlite`；外部只追加 `/api/plugin-market/`、`/api/desktop-cloud/`，容器监听宿主机 loopback3190。

## 已实现的数据协议

- `GET /api/desktop-cloud/v1/me`：当前服务端确认的用户与配额。
- `GET /documents?kind=workspace&offset=0`：仅该账号的文档元数据，100条分页。
- `GET /documents/<kind>/<id>?revision=N`：当前或保留的历史版本；正文摘要可核验。
- `POST /documents`：`operationId,kind,id,expectedRevision,payload,deleted?`。事务 CAS、幂等回执、10版历史；删除为带 revision 的墓碑，旧副本不会无意覆盖它。
- `POST /chunks`：`operationId,digest,content`；每块最多1MiB，摘要校验和账号级去重。
- `GET /chunks/<sha256>`：仅上传账号可取。`file-manifest` 的文件路径和块引用均由服务器校验，不接受跨账号块。

一期账号配额128MiB，涵盖历史文档和文件块，不是容量或高并发达标结论。浏览器、Cookie、设备私钥、API Key、普通配置中的凭据字段及环境文件不进入同步。账号主体沿用当前原生账号 email 契约的服务端命名空间；账号改名仍需显式迁移，不能把 email 当不可变用户 UUID。

## 客户端入口与实际范围

安装版默认账号服务为47；管理员环境变量仍可显式覆盖到经验证的新地址。旧 `backend-link.json` 不再让安装版跳过登录：首次登录明确确认旧本地工作台归属，随后固定到该账号，其他账号不能通过勾选框重新认领。旧数据不搬动、不覆盖。新安装的独立账号目录继续按现有 `identity-profiles` 隔离。

系统连接 → Naumi账号 → 云端备份：**备份 Bot 档案与记忆**，复用 `/naumi/bots` 及既有员工 export API，只选择 Bot 公开信息、档案及已确认记忆；不读取活跃 SQLite 文件，不自动上传聊天全文或工作区所有文件。请求发送前先持久化冻结 outbox，丢回执后的重试复用同一 operationId 和正文。版本冲突保留本机待提交副本，不静默覆盖云端。

云端副本可在任一已登录设备列出、下载为独立 JSON 文件，并核对正文摘要；不把下载副本自动导入正在工作的数据库。全量会话/附件的分批适配、持续双向合并、历史本地账号归属确认及一键重建工作台仍须在后续迁移切片完成，当前不是全量迁移完成声明。文件块与版本协议已为这些数据类别预留，不能以协议存在替代实际迁移验收。

## 部署、备份与回退

只从 main 固定 SHA 打包 `market/`、本目录、`market-contract.js` 和部署/备份脚本。`scripts/deploy-cloud47.py` 在47同时持既有Naumi/工作台部署锁及自身锁；核对 nginx 哈希与现有容器启动时间，构建固定镜像、启动独立容器、检查健康后，仅追加自己的 nginx include。失败只回退自己的网关增量并停止自己的新容器，保留数据目录，不重启 Canvas/Worker/其他服务。

持久数据在 `/opt/naumi-desktop-cloud/data`；使用专用UID和700目录权限。`backup.service/timer` 每日通过 SQLite backup API 生成可读的一致快照并执行 integrity_check；不用只复制活跃主库替代在线备份。当前不自动删除历史备份；容量巡检及异地副本单独实施。

回退新增入口时先确认当前 gateway SHA 等于该次部署回执，移除该 include 或恢复备份并 `nginx -t` 后 reload；停止命名为 `naumi-desktop-cloud-<sha>` 的自身容器，保留云数据与备份。不可拿旧数据库覆盖已接受的新用户写入。具体已部署/验收结果见 `docs/implementation/CLOUD47.md` 与 `evidence/cloud47/VERIFICATION.txt`。

## 复用提示

```text
接续Naumi个人云同步：复用47现有原生账号与桌面CloudSession，不另写密码库或通用HTTP代理。
先读CLOUD47.md，区分实际已备份的Bot档案/确认记忆与尚未迁移的完整会话/文件。
新适配器按账号、revision、digest和持久outbox接入documents/chunks，先预览归属和恢复目录。
不要直接复制运行中的SQLite/WAL，不同步密钥/Cookie，不覆盖本地现有数据。
保留企业EmployeeSync的组织授权/审批职责，不能用个人账号登录冒充企业权限。
```
