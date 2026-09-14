"""Download only the pinned, licensed Qwen3-8B artifacts and verify their hashes.

Run with the isolated WSL vLLM Python. No remote model code is executed.
"""
from pathlib import Path
from hashlib import sha256, sha1
from datetime import datetime, timezone
import json
import os

os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
from huggingface_hub import snapshot_download

ROOT = Path(__file__).resolve().parents[2]
META = ROOT / "docs/planning/evidence/Qwen--Qwen3-8B.json"
MODEL = ROOT / ".models/Qwen3-8B-b968826d9c46dd6066d109eabc6255188de91218"


def main():
    metadata = json.loads(META.read_text(encoding="utf-8"))
    allowed = {"LICENSE", "README.md", "config.json", "generation_config.json", "merges.txt", "vocab.json",
               "tokenizer.json", "tokenizer_config.json", "model.safetensors.index.json"}
    files = [f for f in metadata["files"] if f["rfilename"] in allowed or f["rfilename"].endswith(".safetensors")]
    assert metadata["sha"] == "b968826d9c46dd6066d109eabc6255188de91218"
    assert metadata["license"] == "apache-2.0"
    assert all("/" not in f["rfilename"] and "\\" not in f["rfilename"] for f in files)
    print(json.dumps({"action":"download_pinned_model","revision":metadata["sha"],"files":len(files),"weight_bytes":metadata["weight_bytes"]}), flush=True)
    snapshot_download(repo_id=metadata["id"], revision=metadata["sha"], local_dir=MODEL,
                      allow_patterns=[f["rfilename"] for f in files], max_workers=3)
    records = []
    for file in files:
        path = MODEL / file["rfilename"]
        size = path.stat().st_size
        assert size == file["size"], f"size mismatch: {path.name}"
        digest = sha256()
        blob = sha1(b"blob " + str(size).encode() + b"\0")
        with path.open("rb") as stream:
            while chunk := stream.read(8 * 1024 * 1024):
                digest.update(chunk)
                blob.update(chunk)
        expected = file.get("lfs", {}).get("sha256")
        if expected:
            assert digest.hexdigest() == expected, f"LFS hash mismatch: {path.name}"
        else:
            assert blob.hexdigest() == file["blobId"], f"Git blob mismatch: {path.name}"
        records.append({"file":path.name,"bytes":size,"sha256":digest.hexdigest(),"upstream_identity_verified":True})
        print(json.dumps({"verified":path.name,"bytes":size}), flush=True)
    report = {"evidence_type":"VERIFIED_LOCAL_ARTIFACTS", "observed_at_utc":datetime.now(timezone.utc).isoformat(),
              "repo":metadata["id"],"revision":metadata["sha"],"license":metadata["license"],"files":records,
              "model_path":str(MODEL),"inference_executed":False}
    output = ROOT / "docs/execution/evidence/qwen3-8b-artifacts.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report,indent=2),encoding="utf-8")
    print(json.dumps({"report":str(output),"all_hashes_verified":True}),flush=True)


if __name__ == "__main__":
    main()
