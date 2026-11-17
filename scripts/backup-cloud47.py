"""Consistent online SQLite backups; never copy a live database without its WAL."""
import datetime,fcntl,hashlib,json,os,pathlib,sqlite3,secrets
BASE=pathlib.Path('/opt/naumi-desktop-cloud')
def main():
 backups=BASE/'backups';backups.mkdir(mode=0o700,exist_ok=True)
 with open(BASE/'backup.lock','a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  target=backups/(datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+secrets.token_hex(3));target.mkdir(mode=0o700)
  files=[]
  for name in ['market.sqlite','cloud.sqlite']:
   source=BASE/'data'/name;assert source.is_file() and not source.is_symlink()
   dest=target/name
   with sqlite3.connect('file:'+str(source)+'?mode=ro',uri=True,timeout=15) as src,sqlite3.connect(dest) as out:src.backup(out)
   dest.chmod(0o600)
   with sqlite3.connect(dest) as db:assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
   with open(dest,'rb') as f:os.fsync(f.fileno())
   files.append({'name':name,'bytes':dest.stat().st_size,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'integrity':'ok'})
  receipt={'status':'PASS','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'directory':str(target),'files':files,'activeDatabaseReplaced':False,'retentionDeletion':False}
  (target/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');(target/'receipt.json').chmod(0o600)
  print(json.dumps(receipt,indent=2))
if __name__=='__main__':main()
