import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(),dir=path.join(root,'design/naumi-element-rebuild');
fs.mkdirSync(dir,{recursive:true});
// V: supplied screenshot; D: current DOM; C: installed component source. C alone is not a live interaction pass.
const raw=`
外壳|品牌图标|左上角|点击新建会话；不是无行为装饰|A 品牌入口|常驻；保留点击能力|VD|ui-sidebar
外壳|Naumi 字标|左上角|品牌识别|A 品牌入口|常驻；统一尺寸与字重|VD|naumi-enterprise
外壳|收起与展开左侧栏|品牌右侧|切换左栏占位|B 上下文栏边缘|保留可发现按钮与键盘焦点|VD|ui-sidebar
外壳|侧栏与工作面宽度|左右分隔|原生调整布局与侧栏尺寸|B、C、D 边界|可拖拽；不只改固定宽度|C|ui-layout
外壳|窗口标题与图标|浏览器标签|当前会话名与产品身份|系统标题|保留当前会话标识；品牌统一|D|ui-layout
全局导航|新会话|左侧顶部|按工作区创建原生会话|B 顶部主动作|改为新建协作；行为不变；不等于创建企业任务|VD|ui-sidebar
全局导航|工作台|左侧导航|打开已有 Naumi 面板|A 全局功能栏|保留真实面板；可显示图标与悬浮名称|VD|naumi-enterprise
全局导航|项目与需求|左侧导航|打开已有业务面板|A 全局功能栏|保留；不把本地目录冒充企业项目|VD|naumi-enterprise
全局导航|交付中心|左侧导航|打开已有交付面板|A 全局功能栏|保留真实来源和权限|VD|naumi-enterprise
全局导航|设计中心|左侧导航|打开现有设计工具入口面板|A 全局功能栏|保留；不假装本地已经实现远端工具|VD|naumi-enterprise
全局导航|系统连接|左侧导航|显示真实系统连接状态|A 底部系统组|保留连接异常可达性|VD|naumi-enterprise
全局导航|插件|左侧导航|原生插件管理入口|A 应用与设置组|由更多功能打开；不删除管理能力|VD|ui-plugin-manager
全局导航|自动化任务|左侧导航|原生定时或自动化任务管理|A 应用组|入口保留；运行或异常可带状态点|VD|ui-jobs / ui-schedule
全局导航|更多面板|左侧导航底部|展开其他已注册面板|A 应用组|保留动态插件注册的扩展入口|VD|ui-sidebar
全局导航|账号菜单|左下角|账户及设置入口|A 底部账号|保留；不把 Harness 账户等同企业业务账户|VD|ui-settings-account
工作区与会话|工作区分组标题|左侧中段|组织本地文件目录与会话|B 顶部上下文|保留工作区概念；不直接重命名成企业项目|VD|ui-workspace
工作区与会话|搜索按钮|工作区标题右侧|展开会话搜索|B 搜索入口|与搜索框组合；保留键盘可用性|VD|ui-workspace
工作区与会话|搜索输入与清除|工作区搜索|按会话名称或历史检索|B 顶部搜索行|按需显示；空结果状态保留|DC|ui-workspace
工作区与会话|视图选项|工作区标题右侧|打开分组排序与归档筛选|B 更多菜单|不占独立工具条；完整保留选项|VD|ui-workspace
工作区与会话|添加工作区|工作区标题右侧|选取或添加本地目录|B 工作区选择器|明确本地目录；不新增业务实体|VD|ui-workspace
工作区与会话|目录选择与加载错误|目录弹窗|浏览或原生目录选择；错误重试|B 对应弹层|保留原生与浏览器差异|C|ui-directory-picker-browse / ui-directory-picker-native
工作区与会话|工作区分组行|左侧目录树|展开目录下会话并进入上下文|B 工作区选择器与列表|保留选择和展开层级|VD|ui-workspace
工作区与会话|未分组|左侧列表|归属空缺会话的容器|B 分组|保留真实归属；不隐藏旧会话|VC|ui-workspace
工作区与会话|会话标题|工作区列表内|打开既有会话|B 协作记录|独立列表；保留原 ID 与选择逻辑|VD|ui-workspace
工作区与会话|会话时间|会话行右侧|显示最近更新相对时间|B 会话行|低强调；不与动作竞争|V|ui-workspace
工作区与会话|会话选中与运行状态|会话行|当前会话高亮；运行状态|B 会话行|用边线或状态点；不新增卡片|VDC|ui-workspace
工作区与会话|分组排序筛选|视图选项菜单|按工作区或树或单列表；手动或最近更新；归档筛选|B 列表菜单|保留所有设置与持久化|C|ui-workspace
工作区与会话|会话上下文操作|会话右键菜单|重命名；分叉；归档；取消归档；置顶；复制会话 ID|B 会话行菜单|选择条件和权限仍来自原生解析|C|ui-workspace
工作区与会话|工作区上下文操作|工作区菜单|重命名或移除工作区；记录与文件不随移除删除|B 工作区菜单|保留移除确认与原生语义|C|ui-workspace
工作区与会话|搜索空态与历史加载|左侧列表|无匹配；加载更多；已归档状态|B 列表状态|不伪造记录；可重试|C|ui-workspace
会话顶栏|返回工作台|正文左上角|切换现有 Naumi 工作台|A 工作台入口|减少重复入口；仍可从全局返回|VD|naumi-enterprise
会话顶栏|会话标题与层级|正文顶栏|当前会话及父子会话路径|C 顶部标题区|突出任务名称；父子层级可展开|VD|ui-conversation / ui-subagent
会话顶栏|智能体团队|标题后|团队成员及任务入口|E 协作设置|运行状态可在顶栏给一个计数入口|VD|experimental-ui-agent-team
会话顶栏|标准模式等预设|标题后|选择或查看原生 Agent 预设|E 协作设置|创建前与运行中可编辑性保留；不把它伪装成模型选择|VC|ui-agent-preset
会话顶栏|子智能体计数|标题后|切换子会话；展示运行状态|E 执行与成员面板|有活动时可见；父子会话仍可追溯|VC|ui-subagent
会话顶栏|在文件资源管理器打开|右上角|使用系统应用打开工作目录|D 文件面板工具条|与文件功能靠近；不删除快捷打开|VD|ui-open-in-app
会话顶栏|更多打开方式|文件夹图标旁|选择可用外部应用|D 文件面板菜单|保留安装能力差异和失败提示|VD|ui-open-in-app
会话顶栏|会话更多操作|右上角省略号|显示原生会话上下文动作|C 标题区更多菜单|从实际注册动作生成；不硬编码删减|VD|ui-conversation
会话顶栏|打开右侧栏|右上角|打开文件或预览等上下文面板|D 面板开关|常驻；窄屏采用抽屉|VD|ui-sidebar-right
会话视图|对话页签|顶栏第二行|切换 conversation view|C 主工作面|作为默认内容；不重复显示两条导航|VD|ui-chat
会话视图|轨迹页签|顶栏第二行|显示原生轨迹视图|E 执行记录|保留回看；不是删除日志|VD|ui-trajectory
会话视图|更多会话视图|页签右侧|访问统计等动态注册视图|E 视图菜单|插件增加的视图仍可达|VD|ui-conversation
内容区|用户文本|正文流|显示输入内容及引用|C 内容流|保留结构与文本选择；不添加装饰性聊天泡泡|VD|ui-chat / ui-conversation
内容区|助手正文|正文流|显示 Markdown 回答|C 内容流|提高正文对比度与可读宽度|VD|ui-chat / ui-renderer
内容区|标题与段落层级|助手正文|结构化文字层级|C 正文排版|精简边界；通过字重与间距区分|V|ui-renderer
内容区|分隔线与列表|助手正文|表达正文结构|C 正文排版|保留语义；不转换成无意义卡片|V|ui-renderer
内容区|代码块与语言|正文内|显示代码及语言标记|C 正文或 D 详情|保留横向滚动和复制；不冒充实际执行|VD|ui-renderer
内容区|代码复制与操作|代码块右上角|原生代码块动作|C 对应块悬浮工具条|悬浮和键盘聚焦均可见；保留原动作|VC|ui-renderer
内容区|思考内容|正文流条件出现|原生可展开分析内容|E 可展开记录|保留可用内容；不编造或改写推理记录|C|ui-chat
内容区|工作步骤摘要|正文流条件出现|展示运行与完成及耗时|C 状态摘要 + E 详情|默认一行；展开仍可逐项检查|DC|ui-chat
内容区|工具调用与结果|正文流条件出现|读取文件或执行命令等原生事件|E 执行记录与 D 详情|状态、原参数、结果、错误仍可追溯|DC|ui-tool / ui-action-cards
内容区|工具错误与重试|正文流条件出现|失败结果或请求重试提示|C 就地异常 + E 详情|错误不被成功摘要掩盖；保留取消和重试|C|ui-chat / ui-tool
内容区|文件引用与路径|正文链接或文件卡|打开实际文件或引用|C 行内链接 → D 预览|不新增不存在的文件或交付物|VD|ui-reference / ui-file-actions
内容区|图片与原图预览|正文条件出现|缩略图与查看大图|C 行内预览 → D 或图片弹层|保留加载、失败、关闭和键盘操作|C|ui-chat / ui-attachment
内容区|可交付文件卡|回复末尾|文件名、类型、摘要、打开方式|C 成果条 → D 文件预览|复用实际可交付物；不伪造业务提交动作|VC|ui-deliverables
内容区|文件打开应用下拉|文件卡尾部|使用原生应用打开实际文件|D 文件工具条|保留与文件关联的动作|VC|ui-open-in-app
内容区|轮次导航|正文右侧细标记|跳转到指定轮次或加载历史|C 边缘导航或搜索|降低视觉权重；保留定位能力|VD|ui-chat
内容区|历史加载与回到底部|正文滚动区|加载更早消息；回到底部|C 滚动状态|不可隐藏加载失败与回滚动按钮|C|ui-chat
回复动作|复制回复|回复底部|复制对应内容|C 回复悬浮动作|悬浮和键盘聚焦都可访问|VD|ui-chat
回复动作|赞与问题反馈|回复底部|对对应回复提交原生反馈|C 回复更多菜单|保留反馈状态；不替换反馈后端|VD|ui-message-feedback
回复动作|分享或分支|截图回复底部图标|当前 DOM 证明在新对话中分支；截图图形不能单独证明是分享|C 回复更多菜单|准确命名为分支；不新增分享能力|VD|ui-chat / ui-workspace
回复动作|本轮用量入口|回复底部|打开当前轮次模型及 token 细项|E 本轮详情|低频按需查看；不混淆累计与本轮|VD|ui-chat
回复动作|回复时间|回复底部|消息时间|C 回复元信息|低强调；保留可核对时间|V|ui-chat
回复动作|分支不可用提示|回复动作条件出现|仅已结束轮次的末条回复可分支|C 动作状态|保留禁用原因；不修改原生条件|C|ui-chat
输入区|编辑输入框|底部固定区|原生 contenteditable 草稿|F 输入工作台|突出主动作；沿用原生草稿与引用模型|VD|ui-conversation
输入区|占位与快捷触发提示|输入框空态|提示消息、指令、文件或会话引用|F 输入框空态|精简占位文案；快捷入口仍可发现|VD|ui-conversation
输入区|添加文件或指令按钮|输入框左下角|打开输入能力菜单|F 左下工具组|保留 + 入口；不塞入全局设置|VD|ui-conversation
输入区|斜杠指令候选|输入时弹层|指令、技能、子智能体等候选|F 输入邻近弹层|保留过滤、键盘选择与候选类别|C|ui-input-trigger / ui-commands
输入区|@ 文件与会话引用|输入时弹层|引用本地文件或其他会话|F 输入邻近弹层|保留引用来源和移除；不复制无关业务数据|C|ui-reference / ui-input-trigger
输入区|已选引用|输入草稿内|展示与删除引用|F 输入内容上沿|沿用原生引用结构；不能只保留标签文本|C|ui-reference
输入区|待发送文件与图片|输入框上方|附件缩略、上传状态、移除与重试|F 附件条|实际上传状态不能隐藏|C|ui-conversation / ui-attachment
输入区|图片原图弹层|点击待发送图片|查看原图与关闭|F 图片弹层|保留上传限制与失败反馈|C|ui-conversation
输入区|拖拽接收区域|输入区拖入时|添加文件或图片|F 输入区拖拽态|保留浏览器和桌面目录差异|C|ui-file-drag / ui-conversation
输入区|访问模式选择|输入框左下角|仅可查看、工作区内修改、完全权限等|F 始终可见权限芯片|不可为了好看隐藏当前权限或确认流程|VD|ui-permission-presets
输入区|权限升级确认|选择相关权限时|明确确认权限变更|F 确认弹层|保留原确认与默认值；不自动升级|C|ui-permission-presets
输入区|模型名称|输入框右下角|选择本会话供应商与模型|F 紧凑模型入口|实际模型名称仍可见；不假装统一 Naumi 模型|VD|ui-model-selection
输入区|推理等级|模型名称旁|选择模型支持的推理等级|F 模型弹层|可在入口显示当前等级；保留无等级模型状态|VD|ui-model-selection
输入区|模型搜索与分组|模型弹层|供应商分组、搜索、刷新及错误|F 模型弹层|保留既有分组、路由、默认与凭据|C|ui-model-selection
输入区|发送按钮|输入框右侧|发送原生消息|F 主动作|发送条件、上传阻塞、草稿清理仍原生处理|VD|ui-conversation
输入区|停止生成|生成期间替换发送|停止当前运行|F 主动作状态|运行时显著可达；不收进更多菜单|C|ui-conversation
输入区|排队与插话|运行中输入|原生 Queue / Steer 行为与快捷键|F 运行中动作|准确保留语义；不全部重命名为发送|C|ui-conversation
输入区|计划、目标、审批、提问|运行时插槽或卡片|原生计划或目标操作与用户决策|F 上方就地决策 + E 记录|待处理审批和提问不可折叠到不可见|C|ui-plan / ui-goal / ui-approval / ui-user-questions
性能与状态|轮数与步数|输入框下方|显示原生会话统计|E 详情面板|从常驻底栏收纳；不删除统计|VD|ui-chat
性能与状态|输出速度|输入框下方|原生 tok/s 指标|E 性能详情|按需查看；不换成虚构效率指标|VD|ui-chat
性能与状态|累计 token 用量|输入框下方|原生会话累计统计|E 用量详情|明确累计口径；与本轮详情区分|VD|ui-chat
性能与状态|缓存命中|输入框下方|显示原生缓存统计|E 性能详情|保留真实指标与不可测状态|VD|ui-chat
性能与状态|上下文占用|输入框底部|百分比及分项弹层|F 小型容量指示 → E 详情|低占用弱化；接近阈值时显著提醒|VD|ui-conversation
性能与状态|用量分项|统计弹层|输入、输出、推理、缓存、模型与工具耗时|E 性能详情|原字段不改写；未记录不得补零伪造|C|ui-chat / experimental-ui-stats
右侧工作面|文件列表|右侧条件面板|浏览当前工作区真实文件|D 资源面板|复用原生文件源；不混入企业资产|C|ui-sidebar-files
右侧工作面|文档预览|右侧条件面板|查看实际文档或成果|D 成果工作面|与正文并排；无成果时不空占固定宽度|C|ui-sidebar-documentpreview
右侧工作面|浏览器视图|右侧条件面板|内嵌页面及浏览能力|D 浏览器页签|保留真实导航与连接差异|C|ui-sidebar-browser
右侧工作面|终端|右侧条件面板|原生终端视图|D 工具页签|保留执行会话；不伪装成业务审批|C|ui-sidebar-terminal
右侧工作面|子智能体会话|右侧或浮窗|查看或继续被允许的子任务|D 成员页签 + E 状态|保留只读、父会话离线和一次性任务限制|C|ui-subagent
右侧工作面|新标签页|右侧工具条|打开可用面板类型|D 标签工具条|保留动态面板提供方|D|ui-sidebar-right
右侧工作面|分栏|右侧工具条|按宽度条件进行最多两格拆分|D 面板工具条|保留宽度条件与上限提示|DC|ui-sidebar-right
右侧工作面|全屏与退出|右侧工具条|面板全屏切换|D 面板工具条|保留退出和键盘路径|DC|ui-sidebar-right
右侧工作面|关闭、刷新与标签菜单|右侧页签与菜单|关闭、关闭其他、刷新及移回侧栏|D 标签菜单|按能力禁用；不可假装所有类型均可刷新|C|ui-sidebar-right
右侧工作面|收起右侧栏|右侧工具条|回收面板占位|D 边界按钮|状态与宽度保留；不得销毁运行任务|D|ui-sidebar-right
系统状态|会话未连接或被占用|主体或输入条件态|显示会话不可用或其他实例占用|C 就地状态|明确提示；不静默切换会话或账号|C|ui-model-selection / ui-conversation
系统状态|加载、失败、空态|各数据区域|真实加载与可重试错误|对应区域|不使用伪造数据填空|DC|ui-workspace / ui-chat
系统状态|登录与账号失效|账户或运行错误|显示原生账号失效与终止状态|A 账号 + C 错误|不把品牌包装当作替代认证|C|ui-settings-account / ui-chat
系统状态|企业数据与身份隔离|Naumi 业务面板|企业登录、权限不足、接口失败或真实数据|A 业务面板|本次只盘点对话页；无真实业务登录通过声明|C|naumi-enterprise
系统状态|键盘、焦点与悬浮|所有交互控件|可聚焦、菜单展开、焦点回归、快捷键|所有新区域|图标化不等于失去可访问名称|DC|ui-shortcuts / ui-context-menu
`;
const elements=raw.trim().split('\n').map((line,i)=>{const[group,name,current,behavior,destination,rule,evidence,owner]=line.split('|');if(!owner)throw Error('Invalid row '+line);return{id:'E'+String(i+1).padStart(3,'0'),group,name,current,behavior,destination,rule,evidence,owner};});
const groups=[...new Set(elements.map(e=>e.group))];
const q=x=>'"'+String(x).replaceAll('"','""')+'"';
fs.writeFileSync(path.join(dir,'ELEMENTS.csv'),'\ufeff'+['id','group','name','current','behavior','destination','rule','evidence','owner'].map(q).join(',')+'\r\n'+elements.map(e=>Object.values(e).map(q).join(',')).join('\r\n'));
fs.writeFileSync(path.join(dir,'ELEMENTS.json'),JSON.stringify({version:1,status:'INVENTORY_AND_PROPOSAL_NOT_IMPLEMENTED',scope:'Provided screenshot plus current3080 conversation DOM and conditional states in installed sources. Not all nested application screens.',evidenceLegend:{V:'用户截图可见',D:'当前DOM核对',C:'安装组件源码；不代表本轮点击或运行验证'},elements},null,2));
let md=`# Naumi 当前对话页：元素盘点与重组提案\n\n## 结论\n\n上一版通用企业首页方向作废，不据此实施。它添加了原对话页没有的日程、计数与装饰卡片，改变了产品内容，而不是重组既有元素。新的方向是保留全部现有能力，改变分区、层级、组合与展示密度。\n\n本清单共 **${elements.length} 个语义元素/能力单元**，分为 **${groups.length} 组**。每个单元可能包含重复实例或一组同类菜单选项，不等于页面恰有${elements.length}个DOM节点。\n\n### 证据与边界\n\n- V：用户提供截图可见；D：本轮现有3080对话DOM核对；C：安装组件源码核对。只有C的菜单或状态没有逐个点击验收。\n- 当前DOM与截图是不同会话状态；例如截图显示完全权限，当前DOM显示工作区内修改，两者均保留为真实状态，不擅自统一。\n- 不录入真实消息正文、账号、Cookie、密钥或本地目录；DOM清单只保留控件名称与插槽。\n- 清单覆盖对话页可见元素与直接关联的展开/运行/失败状态，不宣称已穷举每个插件的完整设置页面。\n- 新布局是待确认提案；运行插件、模型设置、企业数据库与会话均未修改。\n\n## 为什么当前仍有DSH感\n\n1. 企业功能、开发工具和会话记录挤在同一左栏，三者没有清楚的层级。\n2. 会话顶栏同时展示层级、模式、成员、子智能体与外部打开入口，主标题退成工具条中的一项。\n3. 对话与轨迹并列、输入框与性能遥测堆叠，使开发者控制台成为第一印象。\n4. 品牌变了，但左右分区、控件组合、阅读宽度与视觉节奏没有变化。\n\n## 只重新组合，不增造业务内容\n\n| 新区域 | 复用哪些元素 | 重组原则 |\n|---|---|---|\n| A 全局功能栏 | 品牌、五个Naumi入口、插件、自动化、账号设置 | 窄栏；当前项可识别，图标有悬浮名和键盘名称；低频入口分组 |\n| B 上下文栏 | 工作区、搜索、新会话、会话列表与管理菜单 | 独立可收起；工作区是本地目录，不偷换成企业项目 |\n| C 内容工作面 | 标题、用户输入、助手正文、代码和就地状态 | 单一主标题；正文是主角；无重复导航与多余卡片 |\n| D 资源工作面 | 真实文件、文档、浏览器、终端、子会话 | 打开成果才占位；可预览、分栏或关闭；不生成假交付 |\n| E 执行与信息层 | 模式、团队、子任务、轨迹、性能与用量 | 按需打开，但运行、失败与等待操作状态可见 |\n| F 输入工作台 | 编辑器、附件、指令、引用、权限、模型、发送或停止 | 形成一个稳定操作区；真实权限始终可见；不更改默认行为 |\n\n### 不可被美化掉的能力\n\n- 当前权限、权限升级确认、审批与用户提问、停止动作。\n- 实际供应商/模型/推理等级，以及模型配置和登录失败。\n- 工具错误、上传失败、真实执行状态、原始轨迹与统计口径。\n- 工作区文件和企业数据的身份边界、原生分支/归档/会话层级与持久化。\n- 产品设置里的原开源组件归属与许可证；品牌独立不等于删掉这些记录。\n\n`;
for(const group of groups){md+=`## ${group}\n\n| ID | 元素 | 当前位置 | 原有行为 | 新归属 | 展示与保留规则 | 证据 |\n|---|---|---|---|---|---|---|\n`;for(const e of elements.filter(e=>e.group===group))md+=`| ${e.id} | ${e.name} | ${e.current} | ${e.behavior} | ${e.destination} | ${e.rule} | ${e.evidence} |\n`;md+='\n';}
md+='## 下一轮设计输入\n\n先使用同一条示例会话、同一组真实功能，做对话页的重组稿，而不是另造首页。以主工作面、打开成果面板、审批等待这三个状态验证布局；先确认位置与组合，再定字号、材质、颜色与动效。按钮在后续实现里逐一映射到此清单ID，再集中做完整模块验收。\n';
fs.writeFileSync(path.join(dir,'ELEMENT_INVENTORY.md'),md);
const source=[];
for(const name of fs.readdirSync('node_modules/@deepseek-ai').filter(n=>/dsh-(?:experimental-)?client-ui-/.test(n))){const file=path.join('node_modules/@deepseek-ai',name,'lib/client.js');if(!fs.existsSync(file))continue;const s=fs.readFileSync(file,'utf8');source.push({package:name,file,slots:[...new Set([...s.matchAll(/(?:name|slot|slotName):\s*["']([^"']+)["']/g)].map(x=>x[1]).filter(x=>x.includes('.')))]});}
fs.writeFileSync(path.join(dir,'COMPONENT_SLOTS.json'),JSON.stringify(source,null,2));
console.log(`INVENTORY elements=${elements.length} groups=${groups.length} packages=${source.length} runtime_changes=0`);
