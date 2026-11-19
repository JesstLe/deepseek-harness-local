# Desktop 模型来源复制到 47 管理后台

## 模块与职责
本线程：Desktop配置只读导出、47后台增量导入运维入口、公开回执与精确回滚；基线`d93e8724d430e56ed86dcc38348bdd9779514915`，分支`codex/desktop-model-import47-20261119`。不修改Canvas/协作源码、默认模型、路由、客户积分、员工权限或本机密钥。

## 公共接口、依赖方向与数据归属
- 本地`llm-pi-ai`与原credentials.refs为唯一来源；只复制实际8组连接/38条分组模型，保留协议、URL、上下文、输出上限、推理及兼容选项。OAuth records、聊天、浏览器Cookie不复制。
- 47现有模型执行注册表不支持直接接收Anthropic Messages/Responses，不强制转换成openai-chat。第一切片只存入现有供应商元数据库和来源快照，`employeeAvailability=unassigned`；未发布到员工目录。
- 密钥由固定Naumi源码现有`createCredentialStore.importPlain/read`拥有，沿用AES-GCM和server SETTINGS_SECRET；通过仅运维CLI bundle复用，不复制加密实现。原schema与元数据schema也复用，bundle pin记录源码版本与哈希。
- 来源和每条模型元数据进入既有`app_supplier_source_snapshots`、`app_supplier_model_metadata/versions`，管理员原供应商元数据库页面可读。凭据只进`app_model_credentials`，不进入元数据、日志或Git；各供应商配置通过credentialRef引用。
- 仅SSH严格host pin/受保护原key副本、stdin管道传密钥。远端运维代码不含密钥；CLI清空Web observer preload，不影响在线Web进程。写入持47三锁；数据库事务/源锁、稳定operationId和内容指纹防重复。

## 本次实现与验证
基线模型连接19项通过。新增纯契约测试及实际PG独立schema测试覆盖原协议、8组/38模型的真实迁移前验证、幂等/并发、异载荷拒绝、失败原子回滚、原密钥解密、后台后来编辑与发布引用的回滚拒绝。生产只导入来源，不做模型付费探测。

## 回滚与后续
ROLLBACK只删除该operation创建且仍未变的元数据、来源和未被发布/草稿引用的凭据；保留所有原路由、价格、来源、密钥。真实回滚先在隔离PG schema验证，正式副本保持新增。下一模块才接47员工/设备模型授权、短期凭据和运行时强制准入；配置复制不等于统一管控已经生效。
