# Naumi 产品矩阵统一身份：PRD 与实施记录

日期：2026-11-17。负责人：unified-identity。基线 `8314ecb5a4d0d5917d49bc80f0f21799150de813`。
分支 `codex/naumi-unified-identity-20261117`。模块迭代计数1。

## 1. 产品目标与权威边界

一个Naumi账号进入Canvas／设计中心、Desktop与企业协作。现有无限画布后台是账号创建、密码、停用、到期与撤销的权威；Desktop不另建账号库、不复制密码哈希、不因登录成功授予后台管理员权限。

本次独占：desktop/app/identity*、main/preload、prepare-runtime隐私清单、身份测试与验证脚本；企业client只增加桌面专属账号管理入口。保留Bot、模型、自定义连接、安装器和现有3080服务。Canvas共享checkout存在其他任务未提交内容，仅读取，不修改、不部署。

## 2. 调研与第一阶段决策

Canvas现有原生账号：`POST /api/auth/login`、`GET /api/auth/session`、`POST /api/auth/logout`。
登录复用既有密码校验、频率限制、账号停用与到期检查；session复用`activeNativeUserEmail`的重置撤销／停用／到期检查。
管理后台的`app_users`是已有用户来源，Desktop直接使用原用户名／邮箱与密码，不创建影子账号。

当前Canvas原生账号主键是email，没有可直接复用的不可变用户UUID。协议明确标记subject类型`naumi-email-v1`，以服务端返回的规范email作为一期主体，禁止将本地输入用户名或自造UUID冒充后台主键。后台账号改名的迁移要在后续不可变subject方案中显式完成。

原企业桥是协作业务API，不是Canvas账号API。身份origin与企业协作origin分离，不改成把Canvas地址写进`/api/workspace`；不因为已登录Naumi就自动产生企业组织／设备授权。

## 3. 账号登录切片：已实现

### 职责／接口

- `identity.cjs`：只访问固定Canvas认证API；Chromium持有Cookie；返回公开subject/email/name，丢弃role、积分、token和任意上游字段。
- `identity-runtime.cjs`：账号服务配置、当前进程身份、按issuer+subject隔离的本地profile；不拥有密码或供应商密钥。
- `identity.html/css/js`：浅色Naumi登录／当前账号／退出界面；密码提交后清空，不写日志或配置。
- `main.cjs`：独立安装模式在启动worker前认证，限定本地主frame IPC；开发链接模式保持原服务行为。
- `NAUMI_IDENTITY_ORIGIN`：受管安装的统一身份服务地址；没有预配地址时由首次配置提供HTTPS origin，首次登录成功后只保存非敏感origin。
- 冷启动校验既有服务器会话；无有效会话回到登录。已有进程中的本地工作不因临时断网被主动停止。
- 账号管理入口只在原生统一身份能力可用时出现在系统连接页；普通网页／链接开发壳不显示空入口。

### 数据与生命周期

`userData/identity-profiles/<SHA256(issuer,typed subject)>`为独立账号根目录，企业工作区、Bot、文件、设备和同步状态沿用原模块，但位于该账号根下。
旧全局harness不自动认领、不搬动、不复制Cookie；旧数据归属迁移须显式确认。
原生浏览器account、企业session partition均包含账号namespace。退出释放guest、关闭bridge、清理本地工作台session/cache，只清自己的认证partition；各账号本地文件保留。
运行任务／在途操作拒绝退出和切换；真正退出前复用维护quiesce准入，再停止自己拥有的worker。安装器登记实际账号根目录，保留已有维护协议。

### 成功／失败行为

| 情况 | 预期行为 |
|---|---|
| 原账号密码正确 | 服务器Cookie确认后才创建账号namespace并启动本地worker |
| 错密码、停用、到期、限流 | 保留服务器拒绝语义，不创建账号或启动worker，不自动重试密码提交 |
| 重置／撤销后冷启动 | session校验不通过，回到登录 |
| 服务不可达／TLS失败 | 有界错误，不关闭原本已在运行的本地工作，不伪造新授权 |
| A退出后B登录 | profile、guest和工作台存储隔离；A文件保留 |
| 任务运行中退出 | 拒绝，不杀任务、不换主体 |

## 4. 整个矩阵的后续阶段（尚未实现）

### P2：服务端产品授权与不可变身份

- 在原账号模块内增加不可变subject及显式email改名迁移，不重建另一套账号库。
- 后台管理Canvas/Desktop/协作的产品授权、组织成员和产品内角色；登录不自动升级管理员。
- 跨产品采用标准授权码+PKCE、state、一次性交换、精确redirect校验；不复制不同域Cookie。
- 原生账号一期已接；Supabase模式的浏览器授权回调单独接入，不让客户端猜测凭据协议或回落管理员口令。
- 账号停用／产品授权撤销的在线检查、审计和设备会话撤销，明确本地数据访问与远程能力不同。

### P3：设备授权与模型网关

- 服务端管理模型路由、预算、额度、设备和audience；发短期、可撤销、绑定用户与设备的网关凭证。
- 供应商长期密钥留服务端；Desktop保存必要的设备凭证时使用现有受保护vault，不打进安装包。
- 管理员更改配置后按revision更新，禁止旧回包覆盖新配置；超时／未知状态不重复扣费或重放业务。
- 既有手动自定义URL/API Key不在本切片中删除或暗中改写。

### P4：离线恢复与统一管理面板

- 签名离线租约包含issuer/subject/aud/device/authEpoch/expiry/capabilities；本地验签、时钟回拨和版本回滚防护。
- 有效租约内的本地能力继续；云侧付费／组织写入仍校验服务端权限。撤销传播窗口与租约上限明确记录。
- 本次没有签名离线租约：冷启动断网保持登录待恢复，不把本机缓存当云侧授权。
- 后台统一管理账号／组织／产品授权／设备／模型用量／审计，业务数据仍由各产品模块拥有。

## 5. 验收与交付口径

- 基线及集中单元／集成输出：`evidence/unified-identity/BASELINE.log`、`MODIFIED.log`。
- 真Electron：生产main/preload/账号界面＋受控Canvas认证协议；只有backend/installer I/O为隔离适配，验证Cookie、拒绝、账号切换、任务准入、退出、冷启动撤销与断网。没有真实员工密码或3080操作。
- Canvas现有账号服务器的实际账号验收、远程HTTPS部署、Supabase、P2-P4、现有用户数据迁移均单独保留，不以fixture替代。
- 四项归档、原hash、修改副本与副本回滚命令见VERIFICATION.txt。

## 6. 接续提示

```text
接续Naumi矩阵身份：先查本文件和evidence/unified-identity实际结果。
一期复用Canvas原生auth API；账号并不等于管理员、产品授权或企业设备授权。
不要自动认领原harness数据，不复制Cookie，不把供应商主密钥下发到客户端。
P2接不可变subject与服务端产品授权，P3接设备网关，P4接签名离线租约。
真实站点账号与部署验收单独记录；保留Canvas共享checkout与当前3080服务。
```

## 登录视觉追加决定

用户指定复用 http://127.0.0.1:3112/login 的实际样式，仅移除左上角DESIGN OS；该运行页面来自naumi-design-ops，而非旧naumi-co源码。背景使用相同smoke shader，胶囊导航／按钮使用相同liquid shader，CSS与品牌斜体字标复用，React effect转为DOM生命周期；渲染预算、隐藏暂停、reduced-motion、context loss降级及清理保留。来源hash见desktop/app/identity-style/SOURCE.json。应用离线自带这些文件，不运行时依赖3112，不嵌iframe，也不改变账号校验API。注册胶囊只打开已配置Naumi账号平台首页，由平台控制是否开放注册，不调用协作系统的企业注册接口。

## 主线同步

初始8314ecb；模块1完成后整合86a29bb，保留统一Bot聊天入口、历史面板迁移及所有聊天资产。仅解决本任务账号入口与既有前端逐字节保护测试、gitattributes追加条目的交叠；不回退聊天实现。功能计数仍为1。
