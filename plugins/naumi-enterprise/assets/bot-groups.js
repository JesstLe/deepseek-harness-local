import {filePreviewAddress,taskLabel} from './bot-task-model.js';

const endpoint = '/naumi/bot-groups';
const errors = {
  BOT_GROUP_MEMBER_UNAVAILABLE:'有成员已归档或无法使用。',
  BOT_GROUP_MENTION_REQUIRED:'请选择接话成员，或者在消息里 @ 一位成员。',
  BOT_GROUP_CONFLICT:'请求状态有变化，请刷新后再试。',
  BOT_GROUP_DEFAULT_NOT_MEMBER:'请选择群内成员接话。',
};
const replyLabels = {queued:'排队中',starting:'准备中',sent:'回复中',blocked:'需要确认',
  interrupted:'回复中断',cancelled:'已取消',failed:'回复失败'};

async function request(url, {signal,body}={}) {
  const response = await fetch(url, {credentials:'same-origin',cache:'no-store',signal,
    ...(body && {method:'POST',headers:{'Content-Type':'application/json','x-naumi-bot-groups':'1'},body:JSON.stringify(body)})});
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(errors[data?.error] ?? (response.status === 401 || response.status === 403
    ? '请以本机所有者身份进入群聊。' : '群聊暂时不可用，请稍后重试。'));
  return data;
}

export function createBotGroupsPage(ctx, React) {
  const h = React.createElement;
  const {useEffect,useState,useRef} = React;
  const button = (label,props) => h('button',{type:'button',className:'naumi-btn',...props},label);
  const openSession = sessionId => ctx.uiWorkspace.openSession(sessionId);
  const openFile = file => {
    const sidebar = ctx.get('sidebarRight');
    if (sidebar) sidebar.openResource(filePreviewAddress(file));
    else openSession(file.sessionId);
  };

  function Post({post,label}) {
    const replies = post.replies.map(reply => h('div',{className:'nbg-message',key:reply.id},
      h('strong',null,label(reply.botId)),
      reply.state === 'completed' ? h('p',null,reply.text || '本轮已结束') : h('span',{className:'nbg-muted'},replyLabels[reply.state]),
      reply.state === 'blocked' && button('查看会话',{onClick:() => openSession(reply.sessionId)})));
    return h('article',{className:'nbg-round'},h('div',{className:'nbg-message nbg-user'},h('strong',null,'你'),h('p',null,post.text)),replies);
  }

  function TaskList({tasks,label}) {
    if (!tasks.length) return null;
    const open = tasks.filter(task => ['queued','starting','running','waiting'].includes(task.status)).length;
    const finished = tasks.filter(task => task.status === 'completed').length;
    const items = tasks.slice().sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).map(task => {
      const files = task.files.map(file => button(file.description ?? file.path.split(/[\\/]/).at(-1),{
        key:`${file.sessionId}:${file.seq}:${file.index}`,onClick:() => openFile(file)}));
      return h('article',{key:task.id},h('strong',null,task.subject),
        h('p',{className:'nbg-muted'},`${label(task.targetBotId)} · ${taskLabel(task)}`),task.result && h('p',null,task.result),
        h('div',{className:'nbg-actions'},button('打开任务',{onClick:() => openSession(task.targetSessionId)}),files));
    });
    return h('details',{className:'nbg-tasks'},h('summary',null,`群任务（${tasks.length}） · ${open} 进行中 · ${finished} 已完成`),h('div',{className:'nbg-task-list'},items));
  }

  function CreateRoom({bots,onCreate,onCancel}) {
    const [name,setName] = useState('');
    const [selected,setSelected] = useState([]);
    const [defaultBot,setDefaultBot] = useState('');
    const [pending,setPending] = useState(false);
    const [error,setError] = useState('');
    const operation = useRef(null);
    const reset = () => { operation.current = null; setError(''); };
    const submit = async event => {
      event.preventDefault();
      if (pending || !name.trim() || selected.length < 2) return;
      operation.current ??= crypto.randomUUID();
      setPending(true); setError('');
      try { onCreate(await request(endpoint,{body:{action:'create',id:operation.current,name:name.trim(),botIds:selected,defaultBotId:defaultBot || null}})); }
      catch (failure) { setError(failure.message); }
      finally { setPending(false); }
    };
    return h('form',{className:'nbg-create',onSubmit:submit},
      h('h2',null,'新建 Bot 群聊'),
      h('label',{className:'nbg-field'},'群名',h('input',{value:name,maxLength:80,required:true,autoFocus:true,disabled:pending,
        onChange:event => { reset(); setName(event.target.value); }})),
      h('fieldset',{disabled:pending},h('legend',null,'群成员'),
        bots.length < 2 && h('p',{className:'nbg-muted'},'从 Bot 目录创建至少两位 Bot 后即可建群。'),
        bots.map(bot => h('label',{key:bot.id,className:'nbg-member'},h('input',{type:'checkbox',checked:selected.includes(bot.id),
          disabled:selected.length >= 12 && !selected.includes(bot.id),onChange:event => {
            reset();
            setSelected(current => event.target.checked ? [...current,bot.id] : current.filter(id => id !== bot.id));
            if (!event.target.checked && defaultBot === bot.id) setDefaultBot('');
          }}),bot.name))),
      h('label',{className:'nbg-field'},'默认接话者',h('select',{value:defaultBot,disabled:pending,onChange:event => { reset(); setDefaultBot(event.target.value); }},
        h('option',{value:''},'每次点名'),bots.filter(bot => selected.includes(bot.id)).map(bot => h('option',{key:bot.id,value:bot.id},bot.name)))),
      error && h('p',{role:'alert',className:'nbg-error'},error),
      h('div',{className:'nbg-actions'},button('取消',{onClick:onCancel,disabled:pending}),
        button(pending?'正在创建…':'创建群聊',{type:'submit',className:'naumi-btn primary',disabled:pending || selected.length < 2 || !name.trim()})));
  }

  function Conversation({room,bots}) {
    const [data,setData] = useState(null);
    const [older,setOlder] = useState([]);
    const [historyEnd,setHistoryEnd] = useState(false);
    const [loadingOlder,setLoadingOlder] = useState(false);
    const [text,setText] = useState('');
    const [targets,setTargets] = useState([]);
    const [error,setError] = useState('');
    const [readError,setReadError] = useState('');
    const [sending,setSending] = useState(false);
    const [mentionsOpen,setMentionsOpen] = useState(false);
    const operation = useRef(null);
    const refresh = useRef(null);
    const first = useRef(true);
    const timeline = useRef(null);
    const follow = useRef(true);
    const label = id => bots.find(bot => bot.id === id)?.name ?? '已归档 Bot';
    const url = `${endpoint}?roomId=${encodeURIComponent(room.id)}`;

    useEffect(() => {
      const controller = new AbortController();
      let pending = false, again = false;
      const load = async () => {
        if (pending) { again = true; return; }
        pending = true;
        try { setData(await request(url,{signal:controller.signal})); setReadError(''); }
        catch (failure) { if (!controller.signal.aborted) setReadError(failure.message); }
        finally { pending = false; if (again && !controller.signal.aborted) { again = false; void load(); } }
      };
      refresh.current = load;
      void load();
      const timer = setInterval(() => { if (!document.hidden) void load(); },2000);
      return () => { clearInterval(timer); controller.abort(); refresh.current = null; };
    },[url]);

    const posts = [...new Map([...older,...(data?.posts ?? [])].map(post => [post.seq,post])).values()].sort((a,b) => a.seq-b.seq);
    useEffect(() => {
      if (data && timeline.current && (first.current || follow.current)) {
        timeline.current.scrollTop = timeline.current.scrollHeight;
        first.current = false;
      }
    },[data]);

    const loadOlder = async () => {
      if (!posts[0] || loadingOlder) return;
      setLoadingOlder(true);
      try {
        const result = await request(`${url}&before=${posts[0].seq}`);
        setOlder(current => [...result.posts,...current]); setHistoryEnd(result.posts.length < 50);
      } catch (failure) { setError(failure.message); }
      finally { setLoadingOlder(false); }
    };
    const send = async event => {
      event.preventDefault();
      if (sending || !text.trim()) return;
      operation.current ??= crypto.randomUUID();
      setSending(true); setError('');
      try {
        await request(endpoint,{body:{action:'post',id:operation.current,roomId:room.id,text:text.trim(),botIds:targets}});
        operation.current = null; setText(''); setTargets([]); follow.current = true;
        setMentionsOpen(false); void refresh.current?.();
      } catch (failure) { setError(failure.message); }
      finally { setSending(false); }
    };
    const toggleTarget = id => {
      operation.current = null;
      setTargets(current => current.includes(id) ? current.filter(value => value !== id) : [...current,id]);
    };

    return h('section',{className:'nbg-room','aria-label':room.name},
      h('header',{className:'nbg-room-head'},h('h2',null,room.name),
        h('p',null,room.members.map(member => label(member.botId)).join('、'),
          room.defaultBotId && h('span',{className:'nbg-default'},`默认接话 ${label(room.defaultBotId)}`))),
      readError && h('p',{role:'alert',className:'nbg-error'},readError),
      h('div',{className:'nbg-timeline',ref:timeline,onScroll:event => {
        const node = event.currentTarget; follow.current = node.scrollHeight-node.scrollTop-node.clientHeight < 80;
      }},
        !data && !readError && h('p',{className:'nbg-muted',role:'status'},'正在载入消息…'),
        data && posts.length === 0 && h('p',{className:'nbg-muted'},room.defaultBotId ? '发条消息开始讨论。' : '点名一位群成员开始讨论。'),
        posts.length >= 50 && !historyEnd && button(loadingOlder?'正在载入…':'加载更早的消息',{onClick:loadOlder,disabled:loadingOlder}),
        posts.map(post => h(Post,{post,label,key:post.id}))),
      data && h(TaskList,{tasks:data.tasks,label}),
      h('form',{className:'nbg-compose',onSubmit:send},
        error && h('p',{className:'nbg-error',role:'alert'},error),
        (mentionsOpen || targets.length > 0) && h('div',{className:'nbg-targets','aria-label':'点名成员'},
          room.members.filter(member => bots.some(bot => bot.id === member.botId && bot.status === 'active')).map(member => button(`@${label(member.botId)}`,{
            key:member.botId,'aria-pressed':targets.includes(member.botId),disabled:sending,onClick:() => toggleTarget(member.botId)}))),
        h('textarea',{'aria-label':'群消息',placeholder:room.defaultBotId?'写消息，或 @ 群成员':'点名后写消息',value:text,maxLength:8000,disabled:sending,
          onChange:event => { operation.current = null; setText(event.target.value); }}),
        h('div',{className:'nbg-compose-actions'},button('@ 点名',{'aria-expanded':mentionsOpen,onClick:() => setMentionsOpen(!mentionsOpen)}),
          button(sending?'正在发送…':'发送',{type:'submit',className:'naumi-btn primary',disabled:sending || !text.trim()}))));
  }

  return function BotGroupsPage() {
    const [rooms,setRooms] = useState([]);
    const [bots,setBots] = useState([]);
    const [active,setActive] = useState(null);
    const [creating,setCreating] = useState(false);
    const [loading,setLoading] = useState(true);
    const [error,setError] = useState('');
    const [reload,setReload] = useState(0);

    useEffect(() => {
      const controller = new AbortController();
      setLoading(true); setError('');
      Promise.all([request(endpoint,{signal:controller.signal}),request('/naumi/bots',{signal:controller.signal})])
        .then(([groups,catalog]) => {
          if (controller.signal.aborted) return;
          setRooms(groups.rooms); setBots(catalog.bots); setActive(current => current ?? groups.rooms[0]?.id ?? null);
        }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
      return () => controller.abort();
    },[reload]);

    const selected = rooms.find(room => room.id === active);
    const create = room => {
      setRooms(current => [room,...current.filter(value => value.id !== room.id)]);
      setActive(room.id); setCreating(false);
    };
    return h('main',{className:'naumi-page nbg-page'},
      h('header',{className:'naumi-page-head'},h('h1',null,'Bot 群聊'),button('新建群聊',{onClick:() => setCreating(true),disabled:loading || Boolean(error)})),
      error && h('p',{role:'alert',className:'nbg-error'},error,' ',button('重试',{onClick:() => setReload(reload+1)})),
      loading && h('p',{role:'status',className:'nbg-muted'},'正在载入群聊…'),
      !loading && !error && h('div',{className:'nbg-layout'},
        h('nav',{'aria-label':'群聊列表',className:'nbg-list'},rooms.map(room => button(room.name,{key:room.id,
          'aria-current':active === room.id && !creating ? 'page' : undefined,onClick:() => { setActive(room.id); setCreating(false); }}))),
        creating ? h(CreateRoom,{bots:bots.filter(bot => bot.status === 'active'),onCreate:create,onCancel:() => setCreating(false)}) :
          selected ? h(Conversation,{key:selected.id,room:selected,bots}) : h('p',{className:'nbg-muted nbg-no-room'},'还没有群聊。')));
  };
}
