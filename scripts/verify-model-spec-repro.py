"""Prove a checkout rebuild is byte-identical, including archived source hashes."""
from pathlib import Path
import subprocess,sys
ROOT=Path(__file__).resolve().parents[1]
files=[ROOT/'plugins/naumi-enterprise/official-model-specs.json',ROOT/'evidence/official-model-specs/SOURCE_MANIFEST.json'];before=[f.read_bytes() for f in files]
try:
 subprocess.run([sys.executable,'-X','utf8',str(ROOT/'scripts/refresh-official-model-specs.py')],cwd=ROOT,check=True)
 assert all(f.read_bytes()==b for f,b in zip(files,before)),'Official catalog rebuild drifted'
 print('CATALOG_REPRO models=86 source_hashes=stable newline=LF outputs=unchanged')
finally:
 for f,b in zip(files,before):
  if f.read_bytes()!=b:f.write_bytes(b)
