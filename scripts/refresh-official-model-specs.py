"""Explicit official-document refresh; no model/provider API keys or inference calls.
Usage: python -X utf8 scripts/refresh-official-model-specs.py [--fetch]
Default rebuilds the checked-in snapshot. --fetch stages all known official sources
and publishes only after strict parsing succeeds; review the resulting Git diff.
"""
from pathlib import Path
import sys,json,urllib.request,urllib.parse,concurrent.futures,tempfile,shutil,hashlib,datetime,subprocess,os,zipfile
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1];E=ROOT/'evidence/official-model-specs';sources=E/'sources'
if '--fetch' not in sys.argv:
 raise SystemExit(subprocess.call([sys.executable,str(ROOT/'scripts/build-official-model-specs.py')]))
allowed={'developers.openai.com','platform.claude.com','aistudio.google.com','api-docs.deepseek.com','www.alibabacloud.com','docs.z.ai','platform.kimi.ai','www.kimi.com','platform.minimax.io','docs.x.ai','docs.mistral.ai','docs.cohere.com','docs.volcengine.com'}
staging=Path(tempfile.mkdtemp(prefix='naumi-official-specs-'));shutil.copytree(sources,staging/'sources');P=staging/'sources';records=json.loads((E/'SOURCE_MANIFEST.json').read_text(encoding='utf-8-sig'))
def download(row):
 url=row['finalUrl'];assert urllib.parse.urlparse(url).scheme=='https' and urllib.parse.urlparse(url).hostname in allowed
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Naumi model-spec verification','Accept':'text/markdown,text/html;q=0.9'}),timeout=30) as response:
  assert urllib.parse.urlparse(response.url).hostname in allowed;raw=response.read(4*1024*1024+1);assert len(raw)<=4*1024*1024;final=response.url
 text=raw.decode('utf-8');name=row['name'];(P/(name+'.raw')).write_bytes(raw)
 if '<html' in text[:1000].lower() or '<!doctype' in text[:100].lower():
  soup=BeautifulSoup(text,'html.parser')
  for el in soup(['script','style','nav','header','footer']):el.decompose()
  text=soup.get_text('\n',strip=True)
 assert len(text)>100 and not text.lstrip().startswith('404 ')
 (P/(name+'.txt')).write_text(text,encoding='utf8');return {**row,'finalUrl':final,'sha256':hashlib.sha256(raw).hexdigest(),'status':200}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:updated=list(pool.map(download,records))
by_name={r['name']:r for r in updated};now=datetime.datetime.now(datetime.timezone.utc).isoformat()
for file in P.glob('INDEX*.json'):
 data=json.loads(file.read_text(encoding='utf-8-sig'));data['retrievedAt']=now;data['sources']=[by_name.get(r['name'],r) for r in data['sources']];file.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
output=staging/'catalog.json';env={**os.environ,'NAUMI_SPEC_SOURCE_DIR':str(P),'NAUMI_SPEC_OUTPUT':str(output)};subprocess.run([sys.executable,str(ROOT/'scripts/build-official-model-specs.py')],env=env,check=True)
# The strict parser succeeded. Publish documentation cache and catalog, never user configuration.
for file in P.iterdir():
 if file.is_file():shutil.copyfile(file,sources/file.name)
shutil.copyfile(staging/'SOURCE_MANIFEST.json',E/'SOURCE_MANIFEST.json');target=ROOT/'plugins/naumi-enterprise/official-model-specs.json';temporary=target.with_suffix('.json.tmp');shutil.copyfile(output,temporary);temporary.replace(target)
with zipfile.ZipFile(E/'OFFICIAL_SOURCES.zip','w',zipfile.ZIP_DEFLATED) as z:
 for f in sorted(P.iterdir()):
  if f.is_file():z.write(f,'sources/'+f.name)
print('OFFICIAL_REFRESH published=1 user_config_changed=0 model_calls=0; review source changes before release')
