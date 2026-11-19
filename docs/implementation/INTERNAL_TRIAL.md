# 本地内测安装包

## 模块与职责
负责人：本线程；codex/internal-trial-20261119，基线 d93e8724d430e56ed86dcc38348bdd9779514915。仅desktop后端启动/首次profile与构建脚本、独立内测资源及定向测试。其他模型导入47脚本、生产服务/账号/安装不动；单独本地构建，不向更新源发布。

## 公共接口、依赖方向、数据/状态/事务归属
复用原生启动 `--patch` 临时最高优先级配置层：禁用设置UI插件，原模型适配器只装载精选连接，DeepSeek Flash仅name显示claude fable5.2、id/URL/协议不变。用户配置不删除、别名与UI限制不落盘；正式安装资源不含edition时无需迁移即可恢复。原设置API权限不变；隐藏UI不代表安全隔离。
新安装仅用defaults初始化原生profile和选定凭据，采用原模型真实名称；通过精确模板hash判断是否首次种子，存在用户配置/不同凭据时不覆盖。bootstrap记录使重复启动不再播种。临时模型密钥只在后端环境使用，不放浏览器，正式升级沿用首次保存的原生凭据。
测试包包含用户明确选择的可用连接凭据，只保存在ignored runtime和本地交付目录，不进Git、不上传GitHub、不含其他组/会话/员工/浏览器资料。不开真实模型验收。

## 实现与迁移状态
应用ID、productName、用户目录、NSIS标识和稳定更新feed保持原值。沿用当前main数字版本，文件名加Test区别，后续更高正式版本正常覆盖；不新建“Naumi Test”并行应用。测试包限制依赖随包启动参数，不写永久disabled到用户profile。先做独立Harness/profile/模拟供应商测试，再验证完整包。

## 验证命令、结果及证据层级
原backend/updates/settings基线52/52，exit0；集中验证/实际构建/回滚见evidence/internal-trial/VERIFICATION.txt。不把构建完成当作用户已安装，不把静态兼容断言当作真实安装覆盖。

## 验收与交付状态
原基线52/52；本切片定向63/63；整合模型导入47主线78e1f81后全仓955/955。16项真实隔离Harness/Chromium验证包括原生响应及别名不改wire model、保留历史与真实凭据引用；2次loopback请求（含标题生成）、真实供应商0。初次runner把原生标题请求误当多发，以及把首次浏览器授权新增记录/原生YAML格式化误当数据改动；修正证据断言后通过，失败日志保留。

固定main `ddd504f77e4330edbf69cbf442938958af82006e` 构建 `0.4.3` 内测版，5分组/17模型连接项（16个GPT连接项、1个DeepSeek Flash）。本地EXE `D:/NaumiReleases/internal-test-0.4.3/Naumi-Test-Setup-0.4.3-x64.exe`，495467864 bytes，SHA256 `cd73ce2572371dbf732a2bc9b425eac02c3961c40d945fcb7c8c2943966c9a4e`。

完整45,661运行文件逐hash通过；实际测试版EXE2次启动、当前正式EXE1次启动，19项隔离检查通过，0page errors/0模型调用。两份真实可执行程序依次接同一隔离userData：设置恢复、别名恢复、会话/模型配置/凭据引用保留。正式安装路径的exe/asar/manifest原hash保持，现有3080不重启；测试使用独立LOCALAPPDATA、账号和随机端口。

同产品application ID/用户目录/NSIS维护入口与latest更新feed保留。后续高于0.4.3的正式版可沿原安装路径覆盖；已经验证程序及配置接续，不冒称尚未发布的未来安装器实际覆盖已完成。测试版不单独注册另一个产品。隐藏设置时独立更新入口仍可用。

发布器明确拒绝internal-trial资源（exit1是预期拒绝），构建始终publish:never。源码回滚仅在标记副本，52基线重新通过；不对用户正式安装执行降级。四工件见VERIFICATION及HASHES，包含源码但不包含密钥或测试员工数据。

功能切片计数1，文档/证据计数0。最终证据提交不改变已固定的EXE。未进行真实供应商付费验收、真实用户安装、GitHub Release发布或服务器配置修改。
