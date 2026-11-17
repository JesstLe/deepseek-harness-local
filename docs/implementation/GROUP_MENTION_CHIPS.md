# 输入框内彩色 Agent 提及标签

## 模块与职责
- 负责人：本任务主 Agent；承接 `GROUP_INLINE_MENTIONS.md` 的原生候选模块，本模块为迭代 2。
- 当前任务分支 `codex/group-inline-mentions-20261117`，worktree `E:/Workspace/naumi-inline-mentions`；本切片基线 `e620bd982b77bac92d2dc820c83ae2255658d682`，该基线已经实际加载了第一阶段彩色候选菜单。
- 用户补充：候选选中后，输入框里的 @ 本身也要带颜色与形象，而非普通文字。
- 范围：同一个 group mention provider、原生 composer/trigger 最小扩展、群 CSS/绑定、对应测试、装配及证据。不改变原生编辑器或业务后台。

## 公共接口、依赖方向、状态归属
原生已经有 `ReferenceChipNode`：原子节点、光标、复制、删除、撤销、草稿引用持久化及序列化。直接复用它，不新增 editor node/schema、浮层、输入器或文字扫描 DOM 替换。

1. `onPick` 返回原生 `insert: ReferenceInsert`，source 为 `naumi-group-agents`；ref 只保存 `{roomId,botId,prefixSpace}` 身份/排版元数据。名称为原生 clipboardText；不是拼接 HTML，也不把图片或内部 ID 发给模型。
2. 原生 trigger 公开可选来源接口 `renderReference(session, reference)` 与 `serializeReference(session, ref, signal)`。只有实现接口的来源采用；普通文件/会话引用保留原 codec 和视觉。
3. 原生 composer 把 ReferenceChip 的 source/ref 传给来源 renderer，通过每个原生 InputBar 自己的 React context 作用域调用；未提供来源 renderer 时保留原生 ReferenceChip。未注册的 Session 没有群范围，不渲染为群成员。
4. 展示仍复用 `createBotAvatar`，24px 原生形象 + 同 appearance palette 的浅色底、描边和文字。标签订阅同一个 Bot catalog，形象/配色/名称变化反映在显示上，没有复制另一份头像 SVG。
5. 原生 NodeKey、引用数据、原子删除、undo、copy、draft persistence 仍由 Harness 拥有。provider 不读取或修改编辑器私有状态；没有额外 React 文本草稿。
6. 序列化按稳定 botId 再核对当前群成员及 active 状态，使用当前 Bot 名称接入原 mentionedBots；改名不误指向旧名称。跨群、归档或取消会阻止本次提交并保留草稿，不静默降级为普通名称。
7. 旧版纯文本 @ 仍可按原规则输入/发送；新选择使用彩色原生标签。既有纯文本草稿不被后台自动改写。新的彩色标签刷新或切群后按原生语义草稿恢复。

## 本次实现与迁移状态
沿用两个固定上游扩展生成器，接受原始包及已发布的上一版扩展，生成一致新字节；未知 SHA 拒绝。原始 `.naumi-original` 备份保留；sync 与 desktop staging 已有调用，自动装配新版本。不改上游包版本或 shared inode。

候选菜单沿用上一模块；标签 renderer 只负责视觉。为保持已有回归脚本可用，原来的 22 项 UI 脚本同步接受真实原生 reference。新脚本额外覆盖输入框形象/颜色、原子删除/撤销、语义恢复和原生复制。测试中的 DOM 文本投影只用于观察；实际复制和实际 transport payload 另行验证，避免把 SVG 的布局换行误判为消息换行。

## 验证命令、结果及证据层级
- 新 source/reference 单元 3/3，通过；覆盖稳定身份、名称更新、跨群/归档/取消和 pinned 升级。
- 现有群协作 + inline provider 18/18，通过。
- 独立 Harness 的真实原生编辑器/引用节点/菜单与临时群 DB，29 项交互通过，无页面错误/无模型调用。原生 copy 使用独立 ClipboardEvent/DataTransfer，未改系统剪贴板。
- 输入框彩色标签截图已保存并打开检查；修正 Avatar 基础样式覆盖尺寸的问题，以更高的群内作用域优先级固定 24px，不更改全局头像尺寸。
- 集中全量、基线、副本回滚和实际运行装载结果见 `../../evidence/group-mention-chips/VERIFICATION.txt`。

## 未完成项与下一步
实际装载以 DEPLOYMENT.json 为准；不发送真实测试群消息或调用供应商。安装包不在本切片重建，后续 staging 已覆盖。回滚基线保留上一阶段彩色候选菜单，不还原群名/消息/任务/模型或用户草稿。

集中全量：`node --test tests/*.test.mjs desktop/tests/*.test.cjs`，602/602 通过。最终 UI 29 项通过；原生表单内标签的 Avatar 尺寸已用更高特异性保持 24px，候选形象 32px，未影响其他区域。
