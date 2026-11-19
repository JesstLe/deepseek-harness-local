"""47-only operator import. Public code on disk; secret request stays on stdin."""
import argparse,contextlib,fcntl,hashlib,json,os,pathlib,subprocess,sys

def main():
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['inspect','apply','verify','rollback','fixture']);p.add_argument('--operation',required=True);p.add_argument('--bundle',required=True);p.add_argument('--sha256',required=True);a=p.parse_args()
 assert len(a.operation)==36 and all(c in '0123456789abcdef-' for c in a.operation)
 bundle=pathlib.Path(a.bundle);assert hashlib.sha256(bundle.read_bytes()).hexdigest()==a.sha256,'BUNDLE_DRIFT'
 base=pathlib.Path('/opt/naumi-staging/evidence/desktop-model-import47-20261119');base.mkdir(mode=0o700,parents=True,exist_ok=True);os.chmod(base,0o700)
 with contextlib.ExitStack() as stack:
  if a.mode in ['apply','verify','rollback']:
   for f in ['/opt/naumi-staging/releases/deploy.lock','/opt/naumi-reverse-hub/releases/deploy.lock','/opt/reference-workbench/deploy.lock']:
    handle=stack.enter_context(open(f,'a'));fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
  rows=subprocess.check_output(['docker','ps','--format','{{.Names}}']).decode().splitlines();webs=[n for n in rows if n.startswith('naumi47-web-')];assert len(webs)==1,'WEB_NOT_CONVERGED';web=webs[0]
  running={n:json.loads(subprocess.check_output(['docker','inspect',n]))[0]['State']['StartedAt'] for n in rows}
  destination='/tmp/desktop-model-import47-'+a.operation+'.cjs'
  subprocess.run(['docker','cp',str(bundle),web+':'+destination],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
  try:
   request=sys.stdin.buffer.read(2*1024*1024+1) if a.mode in ['apply','verify'] else b'';assert len(request)<=2*1024*1024,'INPUT_LIMIT'
   result=subprocess.run(['docker','exec','-i','-u','0','-e','NODE_OPTIONS=','-e','NODE_PATH=/app/node_modules',web,'node',destination,a.mode,a.operation],input=request,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=90)
   value=json.loads(result.stdout);assert value.get('status') in ['PASS','FAIL'],'BAD_RECEIPT'
   unchanged=all(json.loads(subprocess.check_output(['docker','inspect',n]))[0]['State']['StartedAt']==started for n,started in running.items());assert unchanged,'CONTAINER_RESTARTED'
   value['containersUnchanged']=True;value['sourceWeb']=web
   receipt=base/(a.operation+'-'+a.mode+'.json');receipt.write_text(json.dumps(value,indent=2)+'\n');receipt.chmod(0o600)
   print(json.dumps(value));return result.returncode
  finally:subprocess.run(['docker','exec','-u','0',web,'rm','-f',destination],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

if __name__=='__main__':
 try:sys.exit(main())
 except BlockingIOError:print(json.dumps({'status':'DEFERRED','error':'DEPLOYMENT_LOCK_BUSY'}));sys.exit(75)
 except Exception:print(json.dumps({'status':'FAIL','error':'OPERATOR_IMPORT_FAILED'}));sys.exit(1)
