# 原生执行缺口（2026-11-18）

职责/文件：managed-workspace.cjs/.ps1 只初始化 Naumi 新建的空工作区；bots.js 复用它，desktop/app/backend.cjs 也使用同一个模块。package files 追加两个运行文件；既有目录/模型/权限预设和企业模块不迁移。

机制：原生 AclWriteGrant 同一调用设置 capability ACE、ambient-delete deny、Low mandatory label。源码明确 label 需要 WRITE_OWNER，而目录所有者仅隐含 READ_CONTROL/WRITE_DAC。E盘新目录 owner 为当前用户但仅继承 Authenticated Users Modify，原生 grant Win32 5；用户 Temp继承本用户 FullControl则正常。独立探测只给所有者补 WRITE_OWNER 后原接口成功。探测初版用.NET方法受ConstrainedLanguage拒绝，其stdout的INSIDE_OK不是有效写入证据；已排除，最终用Set-Content加真实字节断言和负向边界。

实现：父目录检查、独立空 staging目录、owner校验，仅向同一owner添加可继承的TakeOwnership/WRITE_OWNER，保留全部原ACL、不重设继承、不改owner、不加Everyone/Users、不提升权限。初始化成功后rename发布；失败不发布目标，只清除仍为空的自有staging；出现未知文件/链接时保留并失败。已有工作区不做隐式ACL修复；外部/历史目录的权限仍由owner独立安排。原生sandbox继续负责能力SID、Low标签、私有temp与执行。

验证：48项定向（managed workspace、Bot管理、桌面宿主）pass48/fail0/exit0；其中真实Windows restricted-token子进程写入工作区成功，修改外部文件、写入同为Low标签的另一工作区、修改DACL均拒绝。第一次测试发现PS7父进程PSModulePath使内置Windows PS5加载错误，已限定该单个初始化子进程只使用inbox模块，失败日志保留。

真实验收：首次7入口请求全部HTTP200，但原生shell因上述ACL错误进入input-required，未批准权限升级。第二次10入口请求已成功读/计算CSV，但1536的测试输出上限使文件写入tool call发生max-tokens，保留failed任务、不重放。第三次4096上限下自然回复只有文字草案、没有持久提议（3入口请求）；单独提炼原systemPrompt goal-policy，要求真实工具收据、不重复问已给条件、仍由owner确认。第四次新隔离case继续中。所有失败均保留，不把HTTP200或模型结束当验收成功。

未完成：第四轮真实全链、集中回归、源码副本回滚/四件套/主线、最终安装包；当前目标active。

后续实测已21检查/3启动通过，完整804/804回归通过，详见DAILY_REAL_ACCEPTANCE。54入口/51全home持久原生响应，另有3补充文本artifact待收敛；不把本切片的成功记为全部Goal完成。
