"""Pinned safe-tensor research fixture for the isolated Petals reference."""
from datetime import datetime,timezone
from hashlib import sha256,sha1
from pathlib import Path
import json
import os
import urllib.request
os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
os.environ['HF_HUB_DISABLE_PROGRESS_BARS']='1'
from huggingface_hub import snapshot_download

ROOT=Path(__file__).resolve().parents[2]
REV='ac2ae5fab2ce3f9f40dc79b5ca9f637430d24971'
MODEL=ROOT/'.models/bloom-560m-ac2ae5fab2ce3f9f40dc79b5ca9f637430d24971'


def main():
    url=f'https://huggingface.co/api/models/bigscience/bloom-560m/revision/{REV}?blobs=true'
    with urllib.request.urlopen(url,timeout=30) as f: metadata=json.load(f)
    assert metadata['sha']==REV
    names={'LICENSE','README.md','config.json','model.safetensors','tokenizer.json','tokenizer_config.json','special_tokens_map.json'}
    files=[f for f in metadata['siblings'] if f['rfilename'] in names]
    assert len(files)==len(names) and sum(f['size'] for f in files)<2*1024**3
    snapshot_download(repo_id='bigscience/bloom-560m',revision=REV,local_dir=MODEL,allow_patterns=sorted(names),max_workers=2)
    records=[]
    for file in files:
        path=MODEL/file['rfilename']; size=path.stat().st_size
        assert size==file['size']
        digest=sha256(); blob=sha1(b'blob '+str(size).encode()+b'\0')
        with path.open('rb') as f:
            while chunk:=f.read(8*1024*1024):digest.update(chunk);blob.update(chunk)
        if 'lfs' in file: assert digest.hexdigest()==file['lfs']['sha256']
        else: assert blob.hexdigest()==file['blobId']
        records.append({'file':path.name,'bytes':size,'sha256':digest.hexdigest(),'upstream_identity_verified':True})
    result={'evidence_type':'VERIFIED_LOCAL_ARTIFACTS','observed_at_utc':datetime.now(timezone.utc).isoformat(),
            'repo':'bigscience/bloom-560m','revision':REV,'license':metadata['cardData']['license'],'files':records,
            'pickle_weight_files_downloaded':False,'public_catalog_qualified':False}
    out=ROOT/'docs/execution/evidence/bloom-artifacts.json'
    out.write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps({'report':str(out),'bytes':sum(r['bytes'] for r in records)}))


if __name__=='__main__':main()
