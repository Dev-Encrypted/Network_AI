"""Bounded inspection of pinned K3 tensor headers and one expert's raw slices.

No repository Python is executed. Partial HTTP ranges cannot authenticate a
whole-shard LFS digest: the evidence explicitly records that limitation.
"""
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import json
import re
import struct
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
REVISION = "f831ab66814297da540d832a5235f8e904f29d06"
FILES = [f"model-{n:05d}-of-000096.safetensors" for n in (1,2,4,94,95,96)]
MAX_HEADER = 4 * 1024 * 1024
MAX_SLICE_TOTAL = 64 * 1024 * 1024


def byte_range(filename, start, length):
    assert filename in FILES and 0 <= start and 0 < length <= MAX_SLICE_TOTAL
    end = start + length - 1
    url = f"https://huggingface.co/moonshotai/Kimi-K3/resolve/{REVISION}/{filename}?network_ai_range={start}-{end}"
    req = urllib.request.Request(url,headers={"Range":f"bytes={start}-{end}","User-Agent":"network-ai-f0-inspection/0.1"})
    with urllib.request.urlopen(req,timeout=90) as response:
        if response.status != 206:
            raise ValueError("server did not honor bounded range; refusing full shard")
        match = re.fullmatch(r"bytes (\d+)-(\d+)/(\d+)",response.headers.get("Content-Range",""))
        if not match or (int(match[1]),int(match[2])) != (start,end):
            raise ValueError("unexpected range boundaries")
        data = response.read(length + 1)
        if len(data) != length:
            raise ValueError("truncated or oversized range")
        return data,int(match[3])


def category(name):
    if ".experts." in name: return "experts"
    if "vision_tower" in name: return "vision"
    if "lm_head" in name: return "lm_head"
    if "embed_tokens" in name: return "embeddings"
    if "res_proj" in name or "res_norm" in name: return "attention_residual"
    if ".mlp." in name: return "dense_mlp"
    if "gate" in name and "attention" not in name: return "router_or_gate"
    return "attention_and_other_state_weights"


def header(filename):
    prefix,size = byte_range(filename,0,8)
    length = struct.unpack("<Q",prefix)[0]
    if not 2 <= length <= MAX_HEADER:
        raise ValueError("header exceeds inspection budget")
    raw,again = byte_range(filename,8,length)
    assert size == again
    data = json.loads(raw)
    categories = Counter()
    tensors = []
    for name,tensor in data.items():
        if name == "__metadata__": continue
        a,b = tensor["data_offsets"]
        assert 0 <= a <= b <= size - 8 - length
        categories[category(name)] += b-a
        if ".experts." not in name or ".experts.0." in name:
            tensors.append({"name":name,"dtype":tensor["dtype"],"shape":tensor["shape"],
                            "payload_bytes":b-a,"file_offset":8+length+a})
    return {"file":filename,"file_bytes":size,"header_bytes":length,"header_sha256":sha256(raw).hexdigest(),
            "tensor_count":len(data)-("__metadata__" in data),"payload_bytes_by_category":dict(categories),
            "selected_tensor_records":tensors,"header_only":True},data,raw


def main():
    out = ROOT / "docs/execution/evidence/kimi-k3"
    out.mkdir(parents=True,exist_ok=True)
    with ThreadPoolExecutor(max_workers=3) as pool:
        inspected = list(pool.map(header,FILES))
    reports = []
    for report,data,raw in inspected:
        (out / (report["file"] + ".header.json")).write_bytes(raw)
        reports.append(report)
        print(json.dumps({"header":report["file"],"tensors":report["tensor_count"],"categories":report["payload_bytes_by_category"]}),flush=True)
    expert = [t for t in reports[1]["selected_tensor_records"] if ".experts.0." in t["name"]]
    assert expert and sum(t["payload_bytes"] for t in expert) <= MAX_SLICE_TOTAL
    local = ROOT / ".models/kimi-k3-unit-expert0"
    local.mkdir(parents=True,exist_ok=True)
    records = []
    for tensor in expert:
        raw,_ = byte_range(FILES[1],tensor["file_offset"],tensor["payload_bytes"])
        path = local / (tensor["name"].split(".experts.0.")[1] + ".raw")
        path.write_bytes(raw)
        records.append({**tensor,"local_file":str(path),"slice_sha256":sha256(raw).hexdigest()})
    result = {"evidence_type":"INSPECTED_PINNED_HEADERS_AND_RAW_SLICES", "observed_at_utc":datetime.now(timezone.utc).isoformat(),
              "repo":"moonshotai/Kimi-K3","revision":REVISION,"headers":reports,"expert0_slices":records,
              "full_shard_digest_verified":False,"partial_cpu_tensor_load_executed":False,"full_inference_executed":False,
              "limitations":["Ranges come from revision-pinned HTTPS URLs; local slice hashes do not verify the full upstream LFS digest",
                             "Packed expert weights are not a complete stage, decoder or model",
                             "Header sizes exclude allocation, activation, state, communication and kernel workspace",
                             "No K3 output parity or GPU kernel qualification is established"]}
    (out / "inspection.json").write_text(json.dumps(result,indent=2),encoding="utf-8")
    print(json.dumps({"report":str(out / "inspection.json"),"expert_payload_bytes":sum(t["payload_bytes"] for t in expert)}),flush=True)


if __name__ == "__main__":
    main()
