"""Materialize one real packed K3 expert on CPU; no inference claim."""
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import json
import math
import time
import torch

ROOT = Path(__file__).resolve().parents[2]


def main():
    inspection = json.loads((ROOT / 'docs/execution/evidence/kimi-k3/inspection.json').read_text())
    tensors = {}
    records = []
    begin = time.perf_counter()
    for item in inspection['expert0_slices']:
        name = item['name'].split('.experts.0.')[1]
        path = ROOT / '.models/kimi-k3-unit-expert0' / (name + '.raw')
        data = bytearray(path.read_bytes())
        assert sha256(data).hexdigest() == item['slice_sha256']
        assert item['dtype'] == 'U8'
        assert len(data) == math.prod(item['shape'])
        tensor = torch.frombuffer(data,dtype=torch.uint8).reshape(item['shape']).clone()
        assert tensor.device.type == 'cpu' and tensor.is_contiguous()
        tensors[name] = tensor
        records.append({'name':name,'shape':list(tensor.shape),'bytes':tensor.nbytes,'dtype':str(tensor.dtype),
                        'slice_hash_reverified':True})
    elapsed = time.perf_counter() - begin
    report = {'evidence_type':'MEASURED_CPU_PARTIAL_LOAD','observed_at_utc':datetime.now(timezone.utc).isoformat(),
              'repo':inspection['repo'],'revision':inspection['revision'],'torch_version':torch.__version__,
              'tensors':records,'tensor_payload_bytes':sum(t.nbytes for t in tensors.values()),'load_seconds':elapsed,
              'whole_shard_digest_verified':False,'dequantization_executed':False,'expert_forward_executed':False,
              'gpu_load_executed':False,'stage_parity_proven':False,'complete_kimi_inference_executed':False,
              'limitations':['U8 contains packed weights and encoded scales; interpreting it as ordinary uint8 arithmetic would be incorrect',
                             'This proves bounded slice loading and layout, not a runnable K3 expert or distributed decoder']}
    out = ROOT / 'docs/execution/evidence/kimi-k3/cpu-unit-load.json'
    out.write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report,indent=2))


if __name__ == '__main__':
    main()
