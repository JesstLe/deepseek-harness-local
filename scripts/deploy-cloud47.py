"""Deploy only Naumi Desktop cloud+market alongside the existing 47 account app.
Run on the target with --sha <fixed main> --archive <uploaded tar> --gateway-sha <observed SHA>.
No account app/worker rebuild, database overwrite, model call, or existing task replay.
"""
import argparse,contextlib,fcntl,hashlib,json,os,pathlib,socket,subprocess,tarfile,time,urllib.request,urllib.error,sys

BASE=pathlib.Path('/opt/naumi-desktop-cloud')
GATE=pathlib.Path('/etc/nginx/sites-available/reference-workbench')
ORIGIN='https://47.105.59.142'
sha=lambda b:hashlib.sha256(b).hexdigest()
def run(args,timeout=180,cwd=None):return subprocess.check_output(args,stderr=subprocess.PIPE,timeout=timeout,cwd=cwd)
def request(url):
 try:
  with urllib.request.urlopen(url,timeout=15) as r:return r.status,json.load(r)
 except urllib.error.HTTPError as e:return e.code,json.load(e)
def atomic(file,data):
 temp=file.with_name(file.name+'.cloud47-tmp');temp.write_bytes(data);temp.chmod(0o644);os.replace(temp,file)
def main():
 p=argparse.ArgumentParser();p.add_argument('--sha',required=True);p.add_argument('--archive',required=True);p.add_argument('--gateway-sha',required=True);a=p.parse_args()
 assert len(a.sha)==40 and all(c in 'abcdef0123456789' for c in a.sha)
 BASE.mkdir(exist_ok=True)
 with contextlib.ExitStack() as stack:
  for file in ['/opt/naumi-staging/releases/deploy.lock','/opt/reference-workbench/deploy.lock',str(BASE/'deploy.lock')]:
   lock=stack.enter_context(open(file,'a'));fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  before=GATE.read_bytes();assert sha(before)==a.gateway_sha,'GATEWAY_BASELINE_CHANGED'
  assert request(ORIGIN+'/api/auth/session')==(200,{'user':None}),'ACCOUNT_BASELINE_CHANGED'
  original_containers={r['Name']:r['State']['StartedAt'] for r in json.loads(run(['docker','inspect',*run(['docker','ps','-q']).decode().split()]))}
  assert all(not pathlib.Path('/etc/systemd/system/naumi-desktop-cloud-backup.'+s).exists() for s in ['service','timer']),'BACKUP_UNITS_ALREADY_MANAGED'
  release=BASE/'releases'/a.sha;assert not release.exists(),'RELEASE_EXISTS'
  release.mkdir(parents=True);e=BASE/'evidence'/a.sha;e.mkdir(parents=True);(e/'gateway.before').write_bytes(before)
  archive=pathlib.Path(a.archive);assert archive.is_file();
  with tarfile.open(archive) as tar:
   assert all(not m.name.startswith('/') and '..' not in pathlib.PurePosixPath(m.name).parts and not m.issym() and not m.islnk() for m in tar.getmembers())
   tar.extractall(release,filter='data')
  assert (release/'services/desktop-cloud/server.mjs').is_file()
  data=BASE/'data';created=not data.exists();data.mkdir(mode=0o700,exist_ok=True)
  if created:os.chown(data,1000,1000)
  import sqlite3
  for name in ['market.sqlite','cloud.sqlite']:
   db=data/name
   if db.exists():
    with sqlite3.connect(db) as src,sqlite3.connect(e/(name+'.backup')) as dest:src.backup(dest)
  with socket.socket() as sock:sock.bind(('127.0.0.1',3190))
  image_info=json.loads(run(['docker','image','inspect','node:24-alpine']))[0]
  base_image=next((d for d in image_info.get('RepoDigests',[]) if 'node@sha256:' in d),None);assert base_image,'PINNED_NODE_IMAGE_REQUIRED'
  image='naumi-desktop-cloud:'+a.sha;container='naumi-desktop-cloud-'+a.sha[:12]
  run(['docker','build','--pull=false','--network=none','--build-arg','BASE_IMAGE='+base_image,'-f','services/desktop-cloud/Dockerfile','-t',image,'.'],timeout=180,cwd=release)
  old_current=os.readlink(BASE/'current') if (BASE/'current').is_symlink() else None
  switched=False;started=False;backup_units=False
  try:
   run(['docker','run','-d','--name',container,'--network','host','--restart','unless-stopped','--read-only','--tmpfs','/tmp:rw,noexec,nosuid,size=32m','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','256m','--cpus','1','--log-opt','max-size=5m','--log-opt','max-file=3','-v',str(data)+':/data','-e','HOST=127.0.0.1','-e','PORT=3190','-e','NAUMI_MARKET_AUTH_ORIGIN='+ORIGIN,'-e','NAUMI_MARKET_PUBLIC_ORIGIN='+ORIGIN,'-e','NAUMI_MARKET_TENANT=naumi',image]);started=True
   for attempt in range(30):
    try:
     if request('http://127.0.0.1:3190/api/desktop-cloud/health')[0]==200:break
    except Exception:pass
    time.sleep(.5)
   assert request('http://127.0.0.1:3190/api/desktop-cloud/health')[1]['product']=='Naumi Desktop Cloud'
   current=BASE/'current';temp=BASE/'current.next';temp.symlink_to(release);os.replace(temp,current)
   marker=' include /opt/naumi-desktop-cloud/current/services/desktop-cloud/nginx-location.conf;'
   text=before.decode();anchor=' listen 443 ssl; server_name 47.105.59.142;'
   assert marker not in text and text.count(anchor)==1,'UNEXPECTED_NGINX_ANCHOR'
   after=text.replace(anchor,anchor+'\n'+marker).encode();atomic(GATE,after);switched=True
   run(['nginx','-t']);run(['systemctl','reload','nginx'])
   assert request(ORIGIN+'/api/desktop-cloud/health')[1]['product']=='Naumi Desktop Cloud'
   assert request(ORIGIN+'/api/plugin-market/health')[1]['product']=='Naumi Market'
   assert request(ORIGIN+'/api/desktop-cloud/v1/me')[0]==401
   assert request(ORIGIN+'/api/plugin-market/v1/me')[0]==401
   assert request(ORIGIN+'/api/auth/session')==(200,{'user':None})
   now={r['Name']:r['State']['StartedAt'] for r in json.loads(run(['docker','inspect',*run(['docker','ps','-q']).decode().split()]))}
   assert all(now.get(name)==value for name,value in original_containers.items()),'EXISTING_CONTAINER_RESTARTED'
   (BASE/'backups').mkdir(mode=0o700,exist_ok=True)
   backup=json.loads(run(['python3',str(release/'scripts/backup-cloud47.py')]))
   assert backup['status']=='PASS'
   for suffix in ['service','timer']:atomic(pathlib.Path('/etc/systemd/system/naumi-desktop-cloud-backup.'+suffix),(release/('services/desktop-cloud/backup.'+suffix)).read_bytes())
   backup_units=True
   run(['systemctl','daemon-reload']);run(['systemctl','enable','--now','naumi-desktop-cloud-backup.timer'])
   record={'status':'PASS','mainSHA':a.sha,'container':container,'image':image,'nodeBase':base_image,'gatewayBefore':sha(before),'gatewayAfter':sha(after),'origin':ORIGIN,'cloudHealth':200,'marketHealth':200,'anonymousCloud':401,'anonymousMarket':401,'accountUnauthenticatedSession':200,'existingContainersUnchanged':len(original_containers),'databaseRestore':False,'modelCalls':0,'persistentData':str(data),'initialBackupVerified':True,'dailyBackupTimer':True}
   (e/'deployment.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record,indent=2))
  except Exception:
   if backup_units:
    subprocess.run(['systemctl','disable','--now','naumi-desktop-cloud-backup.timer'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    for suffix in ['service','timer']:
     unit=pathlib.Path('/etc/systemd/system/naumi-desktop-cloud-backup.'+suffix)
     assert unit.read_bytes()==(release/('services/desktop-cloud/backup.'+suffix)).read_bytes(),'NEWER_BACKUP_UNIT_DO_NOT_OVERWRITE'
     unit.unlink()
    run(['systemctl','daemon-reload'])
   if switched:
    assert sha(GATE.read_bytes())==sha(after),'NEWER_GATEWAY_DO_NOT_OVERWRITE';atomic(GATE,before);run(['nginx','-t']);run(['systemctl','reload','nginx'])
   if started:run(['docker','stop',container]);run(['docker','rm',container])
   if (BASE/'current').is_symlink() and os.readlink(BASE/'current')==str(release):(BASE/'current').unlink()
   if old_current:(BASE/'current').symlink_to(old_current)
   raise
if __name__=='__main__':
 try:main()
 except BlockingIOError:
  print(json.dumps({'status':'WAITING_DEPLOYMENT_LOCK','publicRoutesChanged':False,'existingServicesRestarted':False}));sys.exit(75)
