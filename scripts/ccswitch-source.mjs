import {spawnSync} from 'node:child_process';
export function readCCSwitchSources(){const py=String.raw`
import json,sqlite3,pathlib,tomllib,hashlib,re,os
p=pathlib.Path.home()/'.cc-switch/cc-switch.db';db=sqlite3.connect(p.as_uri()+'?mode=ro',uri=True);rows=[]
for ident,app,name,raw,meta,current in db.execute('select id,app_type,name,settings_config,meta,is_current from providers order by app_type,sort_index'):
 d=json.loads(raw);env=d.get('env',{});cfg={};key=base=api='';models=[];effort={};reason=''
 if app=='codex' and d.get('config'):
  cfg=tomllib.loads(d['config']);p=cfg.get('model_providers',{}).get(cfg.get('model_provider'),{});key=d.get('auth',{}).get('OPENAI_API_KEY','');base=p.get('base_url','');api='openai-responses' if p.get('wire_api')=='responses' else 'openai-completions';models=[cfg['model']] if cfg.get('model') else [];effort={k:v for k,v in cfg.items() if re.search('reason|effort|think',k,re.I) and isinstance(v,(str,int,bool))}
 elif app=='claude':
  key=env.get('ANTHROPIC_AUTH_TOKEN') or env.get('ANTHROPIC_API_KEY','');base=env.get('ANTHROPIC_BASE_URL','https://api.anthropic.com');api='anthropic-messages';models=list(dict.fromkeys(v for k,v in env.items() if (k=='ANTHROPIC_MODEL' or re.fullmatch(r'ANTHROPIC_DEFAULT_\w+_MODEL',k) or k=='CLAUDE_CODE_SUBAGENT_MODEL') and isinstance(v,str) and v));effort={k:v for k,v in env.items() if re.search('EFFORT|THINKING',k) and isinstance(v,(str,int,bool))}
 elif app=='omp':
  key=d.get('apiKey','');base=d.get('baseUrl','');api=d.get('api','');models=[m['id'] for m in d.get('models',[])];effort={m['id']:{k:v for k,v in m.items() if re.search('reason|think|effort',k,re.I)} for m in d.get('models',[]) if any(re.search('reason|think|effort',k,re.I) for k in m)}
 elif app=='gemini':
  key=env.get('GEMINI_API_KEY') or env.get('GOOGLE_API_KEY','');base=env.get('GOOGLE_GEMINI_BASE_URL') or env.get('GEMINI_BASE_URL','');api='google-generative-ai';models=[env['GEMINI_MODEL']] if env.get('GEMINI_MODEL') else []
 elif app=='hermes':
  key=os.environ.get(d.get('key_env',''),'');base=d.get('api','');api='openai-completions';models=[d['default_model']] if d.get('default_model') else []
 else:reason='no-direct-api-key-route'
 rows.append(dict(id=ident,app=app,name=name,baseURL=base,api=api,key=key,models=models,effort=effort,current=bool(current),reason=reason,sourceHash=hashlib.sha256(raw.encode()).hexdigest()))
print(json.dumps(rows,ensure_ascii=False))
`;const child=spawnSync('python',['-c',py],{encoding:'utf8',env:{...process.env,PYTHONIOENCODING:'utf-8'},windowsHide:true,maxBuffer:4*1024*1024});if(child.status!==0)throw Error('CC_SWITCH_READ_FAILED');return JSON.parse(child.stdout);
}