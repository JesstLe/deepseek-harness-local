# Naumi Desktop 0.3.8 发布

## 模块与职责
- 负责人：本任务 `codex/release-038-20261118`；工作区 `E:/Workspace/naumi-release-038-20261118`。
- 基线：main/origin main `f48b33833fc8abf367c8541616b236d741846454`。用户明确要求发版。
- 产品变化仅版本元数据、更新日志；已有 Bot 主聊天切片及旧后端更新入口修复从最新 main 完整打包。不追加模型调用、真实任务、配置迁移、规则或企业改动。

## 公共接口、依赖及数据归属
- 复用原有 prepare-runtime、electron-builder 标准 NSIS、原生更新器与 GitHub Release/latest.yml。
- 复用0.3.7隔离安装和原生打包验收脚本，新增0.3.8 runner；原真实用户安装、快捷方式、3080及个人profile不作为安装目标。
- 固定 main 构建；GitHub明确指定 `JesstLe/naumi-desktop`。0.3.7公开资产保留；0.3.8以新tag发布，不覆盖旧版本。

## 实现与迁移状态
- desktop/package及lock根版本、PRODUCT_VERSION、CHANGELOG提升0.3.8。
- 安装目标为自有/currentuser中文空格目录；先只读检查HKCU/菜单占用，无冲突才使用原安装器验收。旧0.3.7→0.3.8→卸载，保留隔离原生会话、员工人设/记忆/二进制，真实HKLM/ProgramFiles/快捷方式核对保持。
- 不对真实用户强制安装或重启；公开发布后的旧客户端只验证获取/下载到ready，QA通知选择稍后。

## 验证及证据层级
- 基线：`node --test --test-concurrency=1 desktop/tests/updates.test.cjs desktop/tests/installer-maintenance.test.cjs desktop/tests/installer-ui.test.cjs`，42/42，exit0。
- 前一功能固定树全仓828/828、原生隔离17项及实际导航19项已在main留证；本版做发布相关集中测试及真实安装更新，不重跑收费模型。
- 构建、安装、发布和匿名下载状态将在实际完成后追加；四件套只作源码/发布验收归档，不代替安装包本体。

## 未完成项与下一步
- 固定版本合main→重新stage/build→包完整性/隔离升级→公开Release及默认更新源验证→证据重开与清理。
- 功能迭代计数0（发版切片），发布计数待真实公开后记录。
