"""Identify the local artifacts actually used by the LM Studio smoke test."""
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import json
import subprocess

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = {
    'model': Path.home() / '.lmstudio/models/JonathanColetti/Qwen3.8-27B-Uncensored-GGUF/Qwen3.8-27B-Uncensored-Q4_K_M.gguf',
    'backend': Path.home() / '.lmstudio/extensions/backends/llama.cpp-win-x86_64-nvidia-cuda12-avx2-2.34.0/llama-server.exe',
}


def main():
    records = []
    for kind,path in ARTIFACTS.items():
        before = path.stat()
        digest = sha256()
        with path.open('rb') as f:
            while chunk := f.read(8*1024*1024): digest.update(chunk)
        after = path.stat()
        assert (before.st_size,before.st_mtime_ns) == (after.st_size,after.st_mtime_ns)
        records.append({'role':kind,'filename':path.name,'bytes':after.st_size,'sha256':digest.hexdigest()})
    cli = Path.home() / '.lmstudio/bin/lms.exe'
    ps = subprocess.check_output([str(cli),'ps','--json'],text=True,encoding='utf-8')
    result = {'evidence_type':'LOCAL_ARTIFACT_FINGERPRINT','observed_at_utc':datetime.now(timezone.utc).isoformat(),
              'artifacts':records,'loaded_models_snapshot':json.loads(ps),
              'upstream_license_and_origin_qualified':False,'same_as_Qwen3_8B_BF16':False}
    out = ROOT / 'docs/execution/evidence/lmstudio-fingerprints.json'
    out.write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8')
    print(json.dumps({'report':str(out),'fingerprints':records}))


if __name__ == '__main__':
    main()
