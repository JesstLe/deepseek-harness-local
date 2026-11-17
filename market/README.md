# Naumi 员工插件市场服务

使用 Node 24 的内置 SQLite，无第三方服务端依赖。生产端与现有账号服务同域，通过新增 `/api/plugin-market/` 前缀反代，不重启或替换账号应用。

```sh
NAUMI_MARKET_AUTH_ORIGIN=http://127.0.0.1:ACCOUNT_PORT \
NAUMI_MARKET_PUBLIC_ORIGIN=https://ACCOUNT_HOST \
NAUMI_MARKET_DB=/opt/naumi-market/data/market.sqlite \
HOST=127.0.0.1 PORT=3190 node market/server.mjs
```

`AUTH_ORIGIN` 由部署配置固定，必须指向真实账号 `/api/auth/session`，不是客户端传入的地址。账号服务负责会话撤销、停用、到期；市场不会维护第二套密码。此版本以单个部署代表一个企业市场，`NAUMI_MARKET_TENANT` 为服务端固定命名空间，不接受客户端自选 tenant。有效账号默认可创作；全局下架权限仅由服务器 `NAUMI_MARKET_MODERATORS` 邮箱列表指定，不信任账号接口的其他 role 字段或用户提交的作者。多企业共享一套市场服务前需接入账号权威的组织成员校验，不能把部署命名空间当成成员资格。

将 `nginx-location.conf` include 到现有账号 HTTPS server 块，仅新增市场前缀；`nginx -t` 成功后 reload。保留原配置哈希和备份，不修改账号、作品、计费、媒体、模型和 Worker。健康检查 `GET /api/plugin-market/health`；业务接口未登录应返回 401。

容器方式从仓库根 `docker build -f market/Dockerfile -t naumi-market:<MAIN_SHA> .`，以独立容器和持久化 `/data` 启动，固定主线 SHA。若使用 host 网络，显式 `HOST=127.0.0.1`；绑定已有账号应用的本机端口作 auth introspection。不要为通过检查关闭 TLS 验证。

也可使用 `naumi-market.service` 和 `config.example.env`：在服务器创建专用 `naumi-market` 用户及其拥有的 `/var/lib/naumi-market`，将固定 main 版本放入 `/opt/naumi-market/releases/<MAIN_SHA>`，`current` 指向该版本。确认 `/usr/bin/node` >=24.9 后安装 unit；环境文件位于 `/etc/naumi-market.env`（实际账号端口和公开 HTTPS origin 由原部署确定）。首次上线先启动独立服务检查 loopback 健康，再加 nginx 路由。回退代码时切回已验收的 release 并重启**本服务**，不重启账号服务或本地 3080；有数据库变更时先备份并按 schema 兼容性选择恢复，不覆盖活跃 WAL。

同域验收：

```sh
curl --fail http://127.0.0.1:3190/api/plugin-market/health
curl --fail https://ACCOUNT_HOST/api/plugin-market/health
# 未登录必须为 401，不用 --fail 掩盖返回体：
curl -i https://ACCOUNT_HOST/api/plugin-market/v1/me
```

当前部署状态以 `evidence/plugin-market/VERIFICATION.txt` 为准；配置模板与隔离验收不代表远端已经上线。

数据库使用 WAL、外键、原子事务和用户请求幂等回执。发布后版本不可覆盖；下架不删除已发布版本与下载/安装记录。升级前使用 SQLite backup API 或暂停本服务后的完整 SQLite+WAL 快照，不仅复制活跃主库文件。

下载计数在完整响应 finish 后去重记账，不计创建下载票据、点击、失败响应或安装尝试。安装用户以账号+作品去重，只有该账号已完成下载且哈希匹配的安装回执才计入。客户端回执是应用层确认，不宣称恶意客户端不可伪造的硬件证明。评价需要该账号安装记录，创作者不能给自己的作品评分。

包由显式文件清单创建：

```sh
node scripts/package-market.mjs SOURCE_DIR OUTPUT.naumi-plugin.json
```

`SOURCE_DIR/naumi.market.json`：

```json
{
  "schemaVersion": 1,
  "slug": "employee-organizer",
  "title": "资料整理",
  "summary": "按规则整理项目资料",
  "kind": "plugin",
  "version": "1.0.0",
  "description": "填写实际使用方法。",
  "changelog": "首次发布",
  "capabilities": ["files-read"],
  "tags": ["资料"],
  "entry": "plugin.js",
  "files": ["plugin.js", "README.md"]
}
```

技能/工作流用 `kind=skill/workflow`，包含有合法 name/description frontmatter 的 `SKILL.md`；安装生成原生 `dsh-skill-filesystem` provider，不另写技能引擎。Bot 模板用 `kind=bot-template` 加 `template:{name,kind,purpose}`，由已有员工创建表单创建自己的实例，不复制作者的账号、API Key、登录态或权限。

主 Bot 可复用的打包提示：

```text
把当前已经验证的能力准备成 Naumi 插件市场包。
先阅读本仓库 market/README.md 和 market-contract.js。
只选择本任务明确需要的源文件，列出 naumi.market.json 的 files；
填写真实名称、职责、能力声明、版本、使用说明和更新记录。
不得包含环境文件、密钥、Cookie、会话历史或员工私有工作数据。
调用 scripts/package-market.mjs 生成 .naumi-plugin.json，检查内容后交给用户。
发布由用户在“我的作品”导入、确认署名和权限后完成，不自动发布。
```
