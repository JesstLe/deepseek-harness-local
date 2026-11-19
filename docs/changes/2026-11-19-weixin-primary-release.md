# 0.4.5 微信与浏览器完整包接续

模块与职责：微信线程负责0.4.5版本、完整bundle构建、维护升级与本人微信接入核验。安装/CUA线程已明确释放版本与构建窗口；浏览器源码归原线程，保留其实现，不重复改写。

公共接口、依赖方向、数据/状态/事务归属：沿原NSIS维护、linked-service完整inventory与原身份握手；微信沿原IM/credentials/Bot主身份。标准完整包不包含用户API Key、二维码、聊天记录、浏览器Profile。禁止向managed profile散装新增文件。

本次实现与迁移状态：main e0851a2含微信和浏览器。仅desktop/package.json、package-lock版本、PRODUCT_VERSION与CHANGELOG递增0.4.5。不发布公共Release。构建必须在版本合入后的固定main，安装与扫码各自记录，不将构建成功混为运行加载。

验证命令、结果及证据层级：源码整合1006/1006、微信32/32、原IM副本回滚21/21、实际Harness/Chrome12项均通过。完整包、维护计划、安装、数据保留与扫码收发证据后续追加evidence/weixin-primary/RELEASE_*；扫码前状态pending。

未完成项与下一步：固定main构建、真实隔离包、原生维护计划、空闲窗口升级、本人扫码与收发。当前已安装0.4.4不热补、不发模型、不修改真实授权。
