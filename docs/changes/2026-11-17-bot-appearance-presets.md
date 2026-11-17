# Bot 形象 × 配色预设设计

## 模块与职责

负责人：当前任务 agent。独占文件范围：`design/bot-appearance-presets/` 与本文档；不修改生产 Bot 侧栏、任务、员工设置或目录。

## 调研与基线

- 共享 main、origin/main、任务初始 SHA 均为 `c1fe9f0955f5d2344cbf3f7c6a2d2523fd2fa3b3`，共享 checkout 开工干净。
- 分支 `codex/bot-appearance-presets-20261117`，独立工作树 `E:/Workspace/naumi-bot-appearance`。
- 现有 `botTone(id)` 将 Bot 映射到 violet / blue / green / orange 四组。`bot-sidebar.css` 的同一颜色类同时设置背景与圆角，形象与配色耦合。
- 侧栏与右侧团队资料共用 `botTone`；图标由 agent / team 决定。工作中环形动画属于 `bot-task.css`，不应混入身份设计。

## 公共接口、依赖方向、状态归属

- `MODIFIED_FILE.mjs` 是独立、零依赖的设计资产模块，不是已加载的应用文件。
- `SHAPES` 6 个轮廓：圆团、豆荚、方糖、星团、芽芽、机灵。
- `PALETTES` 8 个语义色组：鸢尾紫、晴空蓝、薄荷绿、杏桃橙、蔷薇粉、柠檬黄、雾石灰、雾丁香。每组包含 base / light / shade / ink，不只换背景。
- `avatarSVG({shape,palette},{size,uid,label})` 生成可缩放 SVG；标识符校验、标签转义、每个实例唯一 gradient ID。
- `resolveAppearance({id,appearance})` 使用独立盐与 avalanche 哈希给出稳定默认值；显式合法字段逐轴优先，非法字段逐轴回退。默认值由 10000 个样本覆盖全部 48 组合，不因低位哈希相关性缩成半个矩阵。
- 建议未来持久化字段 `appearance: {shape, palette}`；稳定 Bot ID 不变，展示设置不改 kind、职责、权限、Session 或运行状态。本轮没有修改目录 schema 或写入用户档案。

## 本次实现与迁移状态

- 完成 6 × 8 = 48 矢量组合、交互矩阵、放大预览、24 / 35 / 48 小尺寸、侧栏条目模拟、换一组与重置。
- 设计板由 `node design/bot-appearance-presets/build.mjs` 可重复生成，无服务端、无外部资源、无登录、无模型请求、无存储写入。
- `presets.png` 从实际 HTML 渲染保存，并重新打开检查。
- 这是设计方案交付，尚未接入现有应用，未重建安装包、未重启运行服务。

## 验证命令、结果及证据层级

完整命令、字面输出与退出状态见 `design/bot-appearance-presets/VERIFICATION.txt`。

- BASELINE：原设计 4 色映射、稳定性通过。
- MODIFIED：6 形象 / 8 配色 / 48 唯一组合、显式配置、稳定默认、全组合覆盖、非法参数与注入字符通过。
- HTML 渲染 DOM：728 / 390 宽度，逐个点击 48 组合，预览、单选、尺寸、随机换组、重置、SVG ID 唯一、无横向溢出，console 无 error。
- ROLLBACK：仅另一个副本恢复原源字节，SHA-256 相同，旧 4 色行为通过；设计模块仍保留修改后状态。
- 原生产 `bot-sidebar-model.js` SHA-256 保持 `3e2b01cad958a86ce39d24ecd3638bda4d9d80c9211a772c7462f41dbd37664c`。

## 未完成项与下一步

用户确认形象方向后，再接入 Bot 目录 appearance、原子持久化 / CAS、用户选择入口、侧栏 / 右栏 / 员工名单共用组件，集中验证刷新保持与旧数据兼容。团队标识与工作状态作为独立角标保留，不消耗形象或配色轴。

本轮功能迭代计数 0（独立设计资产，非业务模块）；首次与合并前刷新 origin/main 未发生漂移；不增加成功业务发布计数。
