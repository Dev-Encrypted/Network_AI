"""HTTP/SSE measurements against an explicitly selected local model."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from statistics import median
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
import json
import os
import subprocess
import time
import urllib.request

FIXTURES = [
    ("Responda somente com o nome da capital do Brasil. /no_think", "brasília"),
    ("Quanto é 17 + 25? Responda somente com o número. /no_think", "42"),
    ("Escreva somente a palavra COMPUTAÇÃO, sem explicações. /no_think", "computação"),
]
MAX_SSE_LINE = 1024 * 1024

def percentile(values, fraction):
    if not values:
        return None
    ordered = sorted(values)
    import math
    return ordered[max(0, math.ceil(len(ordered) * fraction) - 1)]

def local_url(base):
    parsed = urlsplit(base)
    if parsed.scheme not in ("http", "https") or parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
        raise ValueError("This local bench only accepts a loopback HTTP endpoint")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("Credentials/query fragments must not appear in endpoint URLs")
    return base.rstrip("/")

def sse_payloads(response):
    data_lines = []
    while True:
        line = response.readline(MAX_SSE_LINE + 1)
        if len(line) > MAX_SSE_LINE:
            raise ValueError("SSE line exceeds the frame budget")
        if not line:
            if data_lines:
                yield "\n".join(data_lines)
            return
        line = line.decode("utf-8").rstrip("\r\n")
        if not line:
            if data_lines:
                yield "\n".join(data_lines)
                data_lines.clear()
        elif line.startswith("data:"):
            data_lines.append(line[5:].lstrip())
            if sum(map(len, data_lines)) > MAX_SSE_LINE:
                raise ValueError("SSE event exceeds the frame budget")

def gpu_snapshot():
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total,memory.used,utilization.gpu,power.draw,temperature.gpu",
             "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=10, check=True)
        names = ("name","memory_total_mib","memory_used_mib","utilization_percent","power_w","temperature_c")
        return [dict(zip(names, (v.strip() for v in line.split(",")))) for line in result.stdout.splitlines()]
    except (OSError, subprocess.SubprocessError) as error:
        return {"unavailable":type(error).__name__}

def sample(base, model, index, max_tokens=64, cancel_after=None, timeout=45):
    base = local_url(base)
    prompt, expected = FIXTURES[index % len(FIXTURES)]
    body = {"model":model,"messages":[{"role":"user","content":prompt}],
            "stream":True,"stream_options":{"include_usage":True},
            "temperature":0,"max_tokens":max_tokens,"seed":20260914,
            "chat_template_kwargs":{"enable_thinking":False}}
    headers = {"Content-Type":"application/json"}
    key = os.environ.get("NETWORK_AI_BENCH_API_KEY")
    if key:
        headers["Authorization"] = "Bearer " + key
    request = urllib.request.Request(base+"/v1/chat/completions", data=json.dumps(body).encode(),
                                     headers=headers, method="POST")
    start = time.perf_counter()
    first = None
    first_generation = None
    stamps = []
    content = []
    usage = {}
    finish_reason = None
    done = False
    cancelled = False
    error = None
    http_status = None
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            http_status = response.status
            for payload in sse_payloads(response):
                elapsed = time.perf_counter()-start
                if elapsed > timeout:
                    raise TimeoutError("absolute session deadline exceeded")
                if payload == "[DONE]":
                    done = True
                    break
                event = json.loads(payload)
                if event.get("usage"):
                    usage = event["usage"]
                for choice in event.get("choices",[]):
                    delta = choice.get("delta",{})
                    text = delta.get("content") or ""
                    reasoning = delta.get("reasoning_content") or ""
                    if not isinstance(text,str) or not isinstance(reasoning,str):
                        raise ValueError("non-text completion delta")
                    if text or reasoning:
                        if first_generation is None:
                            first_generation = elapsed
                        stamps.append(elapsed)
                    if text:
                        if first is None:
                            first = elapsed
                        content.append(text)
                    if choice.get("finish_reason"):
                        finish_reason = choice["finish_reason"]
                if cancel_after and len(stamps) >= cancel_after:
                    cancelled = True
                    break
    except (HTTPError, URLError, OSError, TimeoutError, ValueError) as exception:
        http_status = getattr(exception,"code",http_status)
        error = type(exception).__name__
    total = time.perf_counter()-start
    text = "".join(content)
    count = usage.get("completion_tokens")
    decode_seconds = (stamps[-1]-stamps[0]) if len(stamps)>1 else 0
    rate = (count-1)/decode_seconds if isinstance(count,int) and count>1 and decode_seconds>0 else None
    return {"index":index,"request_sha256":sha256(json.dumps(body,sort_keys=True).encode()).hexdigest(),
            "expected":expected,"synthetic_output":text,"http_status":http_status,
            "ttft_seconds":first,"generation_ttft_seconds":first_generation,
            "total_seconds":total,"received_generation_deltas":len(stamps),
            "backend_usage":usage,"reported_decode_tokens_per_second":rate,
            "finish_reason":finish_reason,"done_marker":done,"client_closed_stream":cancelled,
            "correct_synthetic_answer":expected.casefold() in text.casefold(),
            "completed":done and finish_reason is not None and error is None,
            "response_finished_without_length_cutoff":finish_reason == "stop" and done and error is None,
            "error":error}

def run(base, model, output, samples=30, warmups=3,max_tokens=64):
    if samples < 1 or samples > 1000 or warmups < 0 or warmups > 10:
        raise ValueError("samples/warmups outside the local experiment budget")
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    before = gpu_snapshot()
    if not 1 <= max_tokens <= 1024:
        raise ValueError("output-token budget outside the local experiment limit")
    warm = [sample(base,model,i,max_tokens=max_tokens) for i in range(warmups)]
    results = []
    for i in range(samples):
        result = sample(base,model,i,max_tokens=max_tokens)
        results.append(result)
        print(json.dumps({"sample":i+1,"total":samples,"completed":result["completed"],
                          "ttft":result["ttft_seconds"],"correct":result["correct_synthetic_answer"]}),flush=True)
        if result["http_status"] in (401,403,404):
            break
    cancellation = sample(base,model,0,max_tokens=128,cancel_after=1)
    recovery = sample(base,model,1,max_tokens=32)
    after = gpu_snapshot()
    successful = [r for r in results if r["completed"]]
    latencies = [r["ttft_seconds"] for r in successful if r["ttft_seconds"] is not None]
    rates = [r["reported_decode_tokens_per_second"] for r in successful if r["reported_decode_tokens_per_second"] is not None]
    report = {
        "evidence_type":"MEASURED_LOCAL","experiment":"A_SMOKE_EXISTING_BACKEND",
        "observed_at_utc":datetime.now(timezone.utc).isoformat(),
        "model":model,"endpoint":local_url(base),"physical_hosts":1,
        "configuration":"existing LM Studio model; unchanged shared GPU/context",
        "harness_sha256":sha256(Path(__file__).read_bytes()).hexdigest(),
        "fixture_sha256":sha256(json.dumps(FIXTURES,ensure_ascii=False).encode()).hexdigest(),
        "requested_samples":samples,"samples":len(results),"warmups":len(warm),
        "streams_completed":len(successful),"correct_visible_answers":sum(r["correct_synthetic_answer"] for r in results),
        "maximum_output_tokens":max_tokens,
        "length_cutoffs":sum(r['finish_reason']=='length' for r in results),
        "ttft_definition":"first nonempty visible content delta; reasoning channel measured separately",
        "ttft_p50_seconds":percentile(latencies,.50),"ttft_p95_seconds":percentile(latencies,.95),
        "p99_qualification_available":False,
        "median_reported_decode_tokens_per_second":median(rates) if rates else None,
        "gpu_before":before,"gpu_after":after,
        "client_cancellation_observed":cancellation["client_closed_stream"],
        "request_after_cancellation_completed":recovery["completed"],
        "backend_cancellation_and_resource_reclamation_proven":False,
        "E01_Qwen3_8B_BF16_qualified":False,
        "public_launch_approved":False,
        "limitations":["Short synthetic prompts, not the E01 2K/256 or 8192-token workload",
                      "Backend usage counters are reported, not independently tokenized",
                      "SSE delta timing is not an independently observed GPU token schedule",
                      "GPU was shared with existing applications; no isolated throughput or energy qualification",
                      "One physical host; loopback does not validate WAN, NAT or distributed inference",
                      "Client disconnect and subsequent completion do not prove engine cancellation"]
    }
    for name,data in (("samples.json",results),("warmups.json",warm),
                      ("cancellation.json",{"cancel":cancellation,"subsequent":recovery}),
                      ("report.json",report)):
        (output/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return report
