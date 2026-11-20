# 原生系统工具整合收口

- 本任务源码提交：7767a07；原验证基线07eba78。
- 普通整合主线77689bd模型恢复与0.4.7、2a4e21a团队入口修复，固定树f8c0aa5。
- 最终全仓：node --test --test-concurrency=2 tests/*.test.mjs desktop/tests/*.test.cjs，1077/1077，exit0（INTEGRATED_FULL.log）。
- 首次整合全仓1073/1074，原有backend.test.cjs的owned-process重启fixture出现BACKEND_START_FAILED。backend.cjs与该测试未作本任务修改；33项定向复测通过，随后完整整合1077/1077。原失败留存INTEGRATED_FULL_INITIAL.log，不假定已证明具体根因，也不改无关启动实现掩盖它。
- 修改包固定19个本切片文件，8原文件/11新文件；与整合后源码逐SHA保持一致。上游其他12+4文件不放进本任务回滚，0.4.7和团队修复保留。
- 70模块、17实际Harness/NativeToolExecutor/固定stdioMCP链、20真实Electron/DPAPI/DACL/UI、独立副本回滚42项证据不变。四工件已重开、ZIP CRC和内部19文件SHA通过，ROLLBACK.sh以100755提交。
- 模块迭代计数1；后续整合只计同步与证据，不伪增成功发布次数。
- 运行发布：本轮无安装、无发版、无热载、无共享服务启动/重启、无生产模型/业务写入。Host和native业务桥需同一个后续完整bundle，不只更新其中一侧。此前0.4.6固定包不变；其他线程0.4.7修复保持。
