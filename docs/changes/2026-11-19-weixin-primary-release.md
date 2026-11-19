# 0.4.5 微信与浏览器完整包接续

模块与职责：微信线程负责0.4.5版本、完整bundle构建、维护升级与本人微信接入核验。安装/CUA线程已明确释放版本与构建窗口；浏览器源码归原线程，保留其实现，不重复改写。

公共接口、依赖方向、数据/状态/事务归属：沿原NSIS维护、linked-service完整inventory与原身份握手；微信沿原IM/credentials/Bot主身份。标准完整包不包含用户API Key、二维码、聊天记录、浏览器Profile。禁止向managed profile散装新增文件。

本次实现与迁移状态：main e0851a2含微信和浏览器。仅desktop/package.json、package-lock版本、PRODUCT_VERSION与CHANGELOG递增0.4.5。不发布公共Release。构建必须在版本合入后的固定main，安装与扫码各自记录，不将构建成功混为运行加载。

验证命令、结果及证据层级：源码整合1006/1006、微信32/32、原IM副本回滚21/21、实际Harness/Chrome12项均通过。完整包、维护计划、安装、数据保留与扫码收发证据后续追加evidence/weixin-primary/RELEASE_*；扫码前状态pending。

未完成项与下一步：固定main构建、真实隔离包、原生维护计划、空闲窗口升级、本人扫码与收发。当前已安装0.4.4不热补、不发模型、不修改真实授权。

## 完整包与真实加载结果（2026-11-19）

固定构建main：54196e5544c6fa2aebf80a587ea4f29ccf2cc08a。npm --prefix desktop run build exit0；完整安装器D:/NaumiReleases/0.4.5/Naumi-Setup-0.4.5-x64.exe，504571405字节，SHA256 d6dd998375c9e5dac6a69253b00ec61a4ee4da0d2a7b46e8121254af7783ca81，与latest.yml SHA512一致；未发布公开Release。

发布定向238/238通过。真实隔离安装包验证登录、bundled backend、Bot主聊天、更新检查、钉钉CLI与worker退出，exit0；无主动模型调用。完整bundle两处微信文件及官方inventory哈希通过，原0.4.4到0.4.5只读维护计划22变更通过。首轮只读基线脚本错误要求旧IM接口提供新primaryBotId字段，已改为从旧Bot接口读取，未修改任何真实主身份。

原生维护安装：/allusers /S --updated /D=C:\Program Files\Naumi，安装器exit0。实际客户端/服务0.4.5、managed官方代码delta0、签名实例核验PASS、CUA保留。扫码前114sessions、121份受保护文件逐字节保持，Bot/任务/群/模型四域哈希与原主Bot保持；真实配置无迁移或替换。

用户随后自行扫码并发微信消息。2026-11-19T09:19:26Z只读快照：连接ready，configured=true，主Bot匹配、唯一本人direct绑定、实际入站发送者均匹配；4条inbox settled、5条outbox sent，其中4条正常Bot文字回复；持久化cursor/context所有者匹配。只存计数/布尔证据，不记录真实微信号、消息文本、token或二维码。入站来自用户微信，本线程未伪造微信消息或主动重复执行模型。平台发送回执与用户本人阅读确认仍分别表述。

维护/重启窗口已释放，后续不再重启；持续微信轮询属于已授权正式服务，不是测试宿主占用。仅清理本任务worktree/源码副本/隔离测试资源，保留正式连接和授权数据。微信真实长任务调整、停止与审批不在本轮重复触发，原IM模块32项覆盖原执行契约。

用户最终确认：已连接并收到回复。真人微信私聊→主Bot原生执行→平台发送→用户可见回复闭环通过；不是只凭上游200或outbox sent宣称完成。
