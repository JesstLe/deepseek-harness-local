"""Read CC Switch without mutation and probe only its configured model IDs."""
import concurrent.futures, hashlib, json, os, pathlib, re, sqlite3, time, tomllib
import urllib.request, urllib.error

ROOT = pathlib.Path(__file__).resolve().parents[1]
PRIVATE = ROOT / '.dsh/import-ccswitch'
PUBLIC = ROOT / 'evidence/ccswitch'
PRIVATE.mkdir(parents=True, exist_ok=True)
PUBLIC.mkdir(parents=True, exist_ok=True)
DB = pathlib.Path.home() / '.cc-switch/cc-switch.db'

def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8')

def request(url, key, protocol, payload=None, timeout=25):
    headers = {'User-Agent': 'Naumi/CCSwitch-Import', 'Content-Type': 'application/json'}
    if protocol == 'anthropic-messages':
        headers.update({'x-api-key': key, 'Authorization': 'Bearer ' + key, 'anthropic-version': '2023-06-01'})
    else:
        headers['Authorization'] = 'Bearer ' + key
    started = time.monotonic()
    try:
        req = urllib.request.Request(url, data=None if payload is None else json.dumps(payload).encode(), headers=headers)
        with urllib.request.urlopen(req, timeout=timeout) as response:
            body = response.read(4 * 1024 * 1024)
            data = json.loads(body)
            return {'status': response.status, 'data': data, 'ms': round((time.monotonic()-started)*1000)}
    except urllib.error.HTTPError as error:
        code = None
        try:
            data = json.loads(error.read(16000)); detail = data.get('error', {})
            code = detail.get('code') or detail.get('type') if isinstance(detail, dict) else 'http-error'
        except Exception:
            pass
        return {'status': error.code, 'error': str(code or 'http-error'), 'ms': round((time.monotonic()-started)*1000)}
    except Exception as error:
        return {'status': 0, 'error': type(error).__name__, 'ms': round((time.monotonic()-started)*1000)}

def inventory():
    db = sqlite3.connect(DB.as_uri() + '?mode=ro', uri=True)
    routes, skipped, source_hashes = {}, [], {}
    for row in db.execute('select id,app_type,name,settings_config from providers order by app_type,sort_index'):
        ident, app, name, raw = row; data = json.loads(raw)
        source_hashes[app + '/' + ident] = hashlib.sha256(raw.encode()).hexdigest()
        key, base, protocol, models = '', '', '', []
        if app == 'claude':
            env = data.get('env', {}); key = env.get('ANTHROPIC_AUTH_TOKEN') or env.get('ANTHROPIC_API_KEY', '')
            base = env.get('ANTHROPIC_BASE_URL', 'https://api.anthropic.com')
            protocol = 'anthropic-messages'
            models = [{'id': v} for k,v in env.items() if (k == 'ANTHROPIC_MODEL' or re.fullmatch(r'ANTHROPIC_DEFAULT_\w+_MODEL', k) or k == 'CLAUDE_CODE_SUBAGENT_MODEL') and isinstance(v,str) and v]
        elif app == 'codex' and data.get('config'):
            config = tomllib.loads(data['config']); provider = config.get('model_providers', {}).get(config.get('model_provider'), {})
            key = data.get('auth', {}).get('OPENAI_API_KEY', ''); base = provider.get('base_url', '')
            protocol = 'openai-responses' if provider.get('wire_api') == 'responses' else 'openai-completions'
            models = [{'id': config['model']}] if config.get('model') else []
        elif app == 'omp':
            key = data.get('apiKey', ''); base = data.get('baseUrl', ''); protocol = data.get('api', '')
            models = data.get('models', [])
        elif app == 'hermes':
            key = os.environ.get(data.get('key_env',''), ''); base = data.get('api',''); protocol = 'openai-completions'
            models = [{'id': data['default_model']}] if data.get('default_model') else []
        else:
            skipped.append({'app': app, 'name': name, 'reason': 'no-api-key-route'}); continue
        if not key or not base:
            skipped.append({'app': app, 'name': name, 'reason': 'missing-api-key' if not key else 'missing-endpoint'}); continue
        # Anthropic SDK appends /v1/messages; remove only a terminal /v1 in the imported copy.
        base = base.rstrip('/')
        if protocol == 'anthropic-messages' and base.endswith('/v1'): base = base[:-3]
        identity = (base, protocol, hashlib.sha256(key.encode()).hexdigest())
        if identity not in routes:
            slug = re.sub('[^a-z0-9]+', '-', name.lower()).strip('-') or ('provider-' + ident[:8])
            route_id = 'ccs-' + slug + '-' + hashlib.sha256((' '.join(identity)).encode()).hexdigest()[:6]
            routes[identity] = {'id':route_id,'name':name,'baseURL':base,'api':protocol,'key':key,'models':{},'sources':[]}
        route = routes[identity]; route['sources'].append({'app':app,'id':ident,'name':name})
        for model in models:
            route['models'][model['id']] = {k:v for k,v in model.items() if k in ['id','name','contextWindow','maxTokens']}
    result = [{**r, 'models':list(r['models'].values())} for r in routes.values()]
    save(PRIVATE/'candidates.json', result)
    save(PUBLIC/'inventory.json', {'groups':[{k:v for k,v in r.items() if k!='key'} for r in result], 'skipped':skipped})
    save(PUBLIC/'source-row-hashes.json', source_hashes)
    print(f'INVENTORY groups={len(result)} models={sum(len(r["models"]) for r in result)} skipped={len(skipped)}')

def probe():
    routes = json.loads((PRIVATE/'candidates.json').read_text(encoding='utf8'))
    # Discovery is used only where CC Switch names no model; it does not expand paid model catalogs.
    for route in routes:
        if not route['models']:
            base=route['baseURL']; url=base+'/models' if base.endswith('/v1') else base+'/v1/models'
            result=request(url,route['key'],route['api'])
            values=result.get('data',{}).get('data',[])
            save(PUBLIC/(route['id']+'-catalog.json'), values)
            # Harness is a conversation agent, not an image/video/audio generation client.
            text_prefix=r'^(?:claude|gpt|chatgpt|gemini|grok|deepseek|qwen|glm|kimi|minimax|mimo|nemotron|longcat|llama|mistral|doubao|seed|command|o[134])'
            non_chat=r'image|video|veo|tts|audio|embedding|rerank|realtime|whisper'
            route['models']=[{'id':v['id']} for v in values if isinstance(v,dict) and isinstance(v.get('id'),str) and re.search(text_prefix,v['id'],re.I) and not re.search(non_chat,v['id'],re.I)]
            route['discovery']={'status':result['status'],'catalogModels':len(values),'textCandidates':len(route['models'])}
    if sum(len(r['models']) for r in routes)>100:
        raise RuntimeError('More than 100 candidates; discovery needs a separate bounded selection')
    def test(route,model):
        base=route['baseURL']; protocol=route['api']; mid=model['id']
        if protocol=='anthropic-messages':
            url=base+'/v1/messages'; payload={'model':mid,'max_tokens':64,'messages':[{'role':'user','content':'Reply with OK only.'}]}
        elif protocol=='openai-responses':
            url=base+'/responses'; payload={'model':mid,'max_output_tokens':128,'input':'Reply with OK only.'}
        else:
            url=base+'/chat/completions'; payload={'model':mid,'max_tokens':64,'messages':[{'role':'user','content':'Reply with OK only.'}]}
        result=request(url,route['key'],protocol,payload,timeout=90)
        data=result.pop('data',{})
        if protocol=='anthropic-messages': content=data.get('content',[])
        elif protocol=='openai-responses':content=data.get('output',[])
        else:content=data.get('choices',[])
        valid=result['status']==200 and bool(content) and not data.get('error')
        return {'group':route['id'],'name':route['name'],'model':mid,'valid':valid,**result,'response_items':len(content),'usage':data.get('usage',{})}
    results=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        jobs=[pool.submit(test,r,m) for r in routes for m in r['models']]
        for job in concurrent.futures.as_completed(jobs):
            result=job.result();results.append(result);save(PUBLIC/'probe-results.json',results)
            print(json.dumps({k:v for k,v in result.items() if k not in ['usage']},ensure_ascii=False),flush=True)
    accepted=[]
    for route in routes:
        ids={r['model'] for r in results if r['group']==route['id'] and r['valid']}
        if ids: accepted.append({**route,'models':[m for m in route['models'] if m['id'] in ids]})
    save(PRIVATE/'accepted.json',accepted)
    save(PUBLIC/'accepted.json',[{k:v for k,v in r.items() if k!='key'} for r in accepted])
    print(f'PROBE groups={len(accepted)} valid={sum(r["valid"] for r in results)} failed={sum(not r["valid"] for r in results)}',flush=True)

if __name__=='__main__':
    import sys
    if sys.argv[1]=='verify-source':
        db=sqlite3.connect(DB.as_uri()+'?mode=ro',uri=True)
        now={a+'/'+i:hashlib.sha256(s.encode()).hexdigest() for i,a,s in db.execute('select id,app_type,settings_config from providers')}
        assert now==json.loads((PUBLIC/'source-row-hashes.json').read_text(encoding='utf8'))
        print('CC_SWITCH_SOURCE=UNCHANGED rows='+str(len(now)))
    else:
        {'inventory':inventory,'probe':probe}[sys.argv[1]]()
