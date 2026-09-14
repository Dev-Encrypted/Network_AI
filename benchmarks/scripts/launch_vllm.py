"""Guarded private E01 candidate. Never evicts other applications from the GPU."""
from pathlib import Path
import argparse
import json
import os
import socket
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
MODEL = ROOT / ".models/Qwen3-8B-b968826d9c46dd6066d109eabc6255188de91218"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run",action="store_true")
    parser.add_argument("--validate-config",action="store_true")
    args = parser.parse_args()
    command = [sys.executable,"-m","vllm.entrypoints.openai.api_server", "--model",str(MODEL),
               "--served-model-name","network-ai-qwen3-8b-bf16", "--host","127.0.0.1","--port","8123",
               "--dtype","bfloat16", "--max-model-len","8192", "--max-num-seqs","1",
               "--max-num-batched-tokens","2048", "--gpu-memory-utilization","0.82", "--enforce-eager",
               "--no-enable-log-requests", "--no-enable-log-outputs", "--no-trust-remote-code", "--no-enable-prefix-caching",
               "--default-chat-template-kwargs", '{"enable_thinking":false}']
    config_validated = False
    if args.validate_config:
        from vllm.entrypoints.launchers.cli_args import make_arg_parser
        from vllm.utils.argparse_utils import FlexibleArgumentParser
        parsed = make_arg_parser(FlexibleArgumentParser()).parse_args(command[3:])
        assert parsed.max_model_len == 8192 and parsed.max_num_seqs == 1
        assert not parsed.enable_log_requests and not parsed.trust_remote_code
        config_validated = True
    free = subprocess.run(["nvidia-smi","--query-gpu=memory.free","--format=csv,noheader,nounits"],
                          capture_output=True,text=True,check=True,timeout=10)
    first_free = int(free.stdout.splitlines()[0].strip())
    blockers = []
    if first_free < 21504:
        blockers.append("GPU_0_NEEDS_AT_LEAST_21504_MIB_FREE")
    if not (ROOT / "docs/execution/evidence/qwen3-8b-artifacts.json").is_file():
        blockers.append("MODEL_HASH_VERIFICATION_REQUIRED")
    with socket.socket() as check:
        if check.connect_ex(("127.0.0.1",8123)) == 0:
            blockers.append("PORT_8123_ALREADY_IN_USE")
    print(json.dumps({"command":command,"free_mib":first_free,"blockers":blockers,"dry_run":args.dry_run,
                      "actual_vllm_argument_parser_validated":config_validated}),flush=True)
    if blockers:
        return 2
    if args.dry_run:
        return 0
    os.environ["CUDA_VISIBLE_DEVICES"] = "0"
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    os.environ["VLLM_NO_USAGE_STATS"] = "1"
    os.execv(sys.executable, command)


if __name__ == "__main__":
    sys.exit(main())
