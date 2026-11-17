from pathlib import Path
import json,re,hashlib,datetime,os,zipfile
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1];P=Path(os.environ.get('NAUMI_SPEC_SOURCE_DIR',ROOT/'evidence/official-model-specs/sources'));records={};CHECKED_AT='2026-11-17'
for file in sorted(P.glob('INDEX*.json')):
 snapshot=json.loads(file.read_text(encoding='utf-8-sig'));CHECKED_AT=max(CHECKED_AT,snapshot.get('retrievedAt','')[:10])
 for row in snapshot['sources']:
  if row.get('status')==200:records[row['name']]=row
for name,url in [('kimi-coding-readable','https://www.kimi.com/code/docs/en/'),('kimi-chat','https://platform.kimi.ai/docs/api/chat.md')]:
 archive=ROOT/'evidence/official-model-specs/OFFICIAL_SOURCES.zip'
 if not os.environ.get('NAUMI_SPEC_SOURCE_DIR') and archive.exists():
  with zipfile.ZipFile(archive) as z:b=z.read('sources/'+name+'.txt')
 else:b=(P/(name+'.txt')).read_bytes()
 records[name]={'name':name,'url':url,'finalUrl':url,'sha256':hashlib.sha256(b).hexdigest()}
MODELS={}
def text(name):return (P/(name+'.txt')).read_text(encoding='utf-8')
def raw(name):
 file=P/(name+'.raw')
 if file.exists():return file.read_bytes()
 with zipfile.ZipFile(ROOT/'evidence/official-model-specs/OFFICIAL_SOURCES.zip') as z:return z.read('sources/'+name+'.raw')
def tokens(value):
 value=value.strip().replace(',','');m=re.fullmatch(r'(\d+(?:\.\d+)?)\s*([kKmM])?',value);assert m,value
 return int(float(m[1])*({'k':1000,'m':1000000}.get((m[2] or '').lower(),1)))
def add(id,provider,context,output,source,**extra):
 assert source in records and context>0 and (output is None or output>0)
 r=records[source];MODELS[id]={'id':id,'provider':provider,'contextWindow':context,'maxOutputTokens':output,'source':r['finalUrl'],'checkedAt':CHECKED_AT,'sourceKey':source,'sourceSHA256':r['sha256'],**extra}
for f in sorted(P.glob('openai-gpt*.txt')):
 s=f.read_text(encoding='utf8');id=re.search(r'Model ID: `([^`]+)`',s)[1];c=int(re.search(r'([\d,]+) context window',s)[1].replace(',',''));o=int(re.search(r'([\d,]+) max output tokens',s)[1].replace(',',''));i=re.search(r'Maximum input tokens: ([\d,]+)',s)
 add(id,'OpenAI',c,o,f.stem,input=['text','image'] if 'Input modalities: text, image' in s else ['text'],precision='exact',**({'maxInputTokens':int(i[1].replace(',',''))} if i else {}))
for line in text('claude').splitlines():
 m=re.match(r'\| \[Claude ([^\]]+)\]\(https://platform.claude.com/docs/en/models/([^/]+)/overview\).*?\|\s*([\d.]+[MK]) tokens\s*\|\s*([\d.]+[MK]) tokens',line)
 if m:
  name,slug,c,o=m.groups();add('claude-'+slug,'Anthropic',tokens(c),tokens(o),'claude',input=['text','image'],contextLabel=c,outputLabel=o,precision='documented-unit')
for f in sorted(P.glob('gemini-gemini*.txt')):
 s=f.read_text(encoding='utf8');id=f.stem.removeprefix('gemini-');c=re.search(r'\*\*(?:Context window \(unified input and output token limit\)|Input token limit)\*\*\s*([\d,]+)',s);o=re.search(r'\*\*(?:Max output|Output token limit)\*\*\s*([\d,]+)',s);assert c and o,id
 add(id,'Google',int(c[1].replace(',','')),int(o[1].replace(',','')),f.stem,input=['text','image'],precision='exact',contextKind='total' if 'unified input and output' in s else 'input',**({'maxInputTokens':int(c[1].replace(',',''))} if 'unified input and output' not in s else {}))
for f in sorted(P.glob('zhipu-glm*.txt')):
 s=f.read_text(encoding='utf8');c=re.search(r'Context Length\s*(?:>\s*)+([\d.]+[MK])',s);o=re.search(r'Maximum Output Tokens\s*(?:>\s*)+([\d.]+[MK])',s)
 if not c:c=re.search(r'([\d.]+M)-token context window',s)
 if not o:o=re.search(r'maximum output length of ([\d.]+K)',s)
 assert c and o,f.stem;id=f.stem.removeprefix('zhipu-');add(id,'Z.ai',tokens(c[1]),tokens(o[1]),f.stem,contextLabel=c[1],outputLabel=o[1],precision='documented-unit',**({'input':['text','image']} if id=='glm-5.3-flash' else {'input':['text']} if id=='glm-5.3' else {}))
 if id=='glm-4.5':add('glm-4.5-air','Z.ai',tokens(c[1]),tokens(o[1]),f.stem,contextLabel=c[1],outputLabel=o[1],precision='documented-unit')
assert '> 200K' in text('zhipu') and '> 128K' in text('zhipu')
add('glm-5','Z.ai',200000,128000,'zhipu',contextLabel='200K',outputLabel='128K',precision='documented-unit')
assert 'MAXIMUM: 384K' in text('deepseek') and 'CONTEXT LENGTH\n1M' in text('deepseek')
for id in ['deepseek-flash','deepseek-v4-pro','deepseek-v4-flash','deepseek-v4-flash-vision-exp']:add(id,'DeepSeek',1000000,384000,'deepseek',input=['text'] if id=='deepseek-v4-pro' else ['text','image'],contextLabel='1M',outputLabel='384K',precision='documented-unit',**({'aliasOf':'deepseek-flash'} if id.startswith('deepseek-v4-flash') else {}))
assert 'can be set up to 1048576' in text('kimi-chat')
for id in ['kimi-k3.1-pro','kimi-k3.1-pro-highspeed','kimi-k3']:add(id,'Kimi',1000000,1048576,'kimi-parameters',input=['text','image'],contextLabel='1M',precision='documented-unit',outputSource=records['kimi-chat']['url'])
for id in ['k3','k3.1-pro','k3.1-pro-highspeed','kimi-for-coding']:assert id in text('kimi-coding-readable');add(id,'Kimi Coding',1000000,None,'kimi-coding-readable',contextLabel='最高 1M（套餐限定）',precision='documented-unit',conditional=True)
assert 'kimi-for-coding-highspeed' in text('kimi-coding-readable') and '256K tokens' in text('kimi-parameters')
add('kimi-for-coding-highspeed','Kimi Coding',256000,None,'kimi-coding-readable',contextLabel='256K（套餐限定）',precision='documented-unit',conditional=True)
assert 'deepseek-v4.1-flash-1017' in text('qwen-text')
add('deepseek-v4.1-flash-1017','Alibaba / DeepSeek',1000000,None,'qwen-text',contextLabel='1M',precision='documented-unit')
add('k3-256k','Kimi Coding',256000,None,'kimi-coding-readable',contextLabel='256K',precision='documented-unit')
for id in ['MiniMax-M3','MiniMax-M3.1-Flash']:assert id in text('minimax-anthropic');add(id,'MiniMax',1000000,None,'minimax-anthropic',input=['text','image'],precision='exact',contextLabel='1,000,000')
soup=BeautifulSoup(raw('qwen-text'),'html.parser')
for row in soup.select('tr'):
 cells=[x.get_text(' ',strip=True) for x in row.find_all(['th','td'])]
 if len(cells)>=10 and cells[0].startswith('qwen') and re.fullmatch(r'\d+[MKmk]',cells[1]) and re.match(r'[\d,]+\s*\(',cells[2]) or len(cells)>=10 and cells[0].startswith('qwen') and re.fullmatch(r'\d+[MKmk]',cells[1]) and re.fullmatch(r'\d+[Kk]',cells[2]):
  c=tokens(cells[1]);o=re.match(r'[\d,]+',cells[2])[0];o=tokens(cells[2]) if re.fullmatch(r'\d+[Kk]',cells[2]) else int(o.replace(',',''));add(cells[0],'Alibaba Qwen',c,o,'qwen-text',input=['text','image'],contextLabel=cells[1],outputLabel=cells[2],precision='documented-unit')
for line in text('xai').splitlines():
 m=re.match(r'\| (grok-[\w.\-]+).*?\|\s*([\d.]+[kM])\s*\|',line)
 if m:add(m[1],'xAI',tokens(m[2]),None,'xai',contextLabel=m[2],precision='documented-unit')
add('mistral-large-4','Mistral',1000000,None,'mistral-large',input=['text','image'],contextLabel='1M',precision='documented-unit')
for line in text('cohere').splitlines():
 if not line.startswith('| `command') or '| Live ' not in line:continue
 cells=[x.strip() for x in line.strip('|').split('|')]
 if len(cells)<7:continue
 id=cells[0].strip('`');c=tokens(cells[4]);o=tokens(cells[5]);add(id,'Cohere',c,o,'cohere',input=['text','image'] if 'Images' in cells[3] else ['text'],contextLabel=cells[4],outputLabel=cells[5],precision='documented-unit')
for line in text('doubao-md').splitlines():
 m=re.match(r'\|\[(doubao-seed-(?:evolving|2-1-[\w-]+))\]',line)
 if not m:continue
 c=re.search(r'上下文窗口:\s*(\d+K)',line);o=re.search(r'最大回答.*?\):\s*(\d+K)',line)
 if c and o:add(m[1],'ByteDance Doubao',tokens(c[1]),tokens(o[1]),'doubao-md',input=['text','image'],contextLabel=c[1],outputLabel=o[1],precision='documented-unit')
assert len(MODELS)>=60,len(MODELS)
payload={'version':1,'updatedAt':CHECKED_AT,'unitPolicy':'Exact numeric tokens where published. K/M-only labels use conservative decimal normalization; original labels and precision retained. Synchronous/default API limits only; beta/batch/long-decode increases excluded. Availability and subscription quotas are not inferred from specifications.','models':list(MODELS.values())}
target=Path(os.environ.get('NAUMI_SPEC_OUTPUT',ROOT/'plugins/naumi-enterprise/official-model-specs.json'));target.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n');(P.parent/'SOURCE_MANIFEST.json').write_text(json.dumps([r for r in records.values() if r['finalUrl'] in {u for m in MODELS.values() for u in [m['source'],m.get('outputSource')]}],ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n');print('OFFICIAL_CATALOG models='+str(len(MODELS))+' providers='+str(len(set(x['provider'] for x in MODELS.values())))+' source_hashes=retained');print(json.dumps({p:sum(x['provider']==p for x in MODELS.values()) for p in sorted(set(x['provider'] for x in MODELS.values()))},ensure_ascii=False))
