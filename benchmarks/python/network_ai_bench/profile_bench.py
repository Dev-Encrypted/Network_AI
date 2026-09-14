"""Run exact-input-token synthetic vLLM profiles prepared by the pinned tokenizer."""
from datetime import datetime,timezone
from hashlib import sha256
from pathlib import Path
from statistics import median
import json
import os
import time
import urllib.request
from .http_bench import local_url,sse_payloads,gpu_snapshot,percentile


def run(base,model,fixture_path,output):
    base=local_url(base)
    path=Path(fixture_path)
    fixtures=[json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line]
    if not fixtures or len(fixtures)>100:
        raise ValueError('a bounded preregistered fixture set is required')
    for fixture in fixtures:
        if fixture['prompt_tokens_with_template']+fixture['maximum_output_tokens']>8192:
            raise ValueError('fixture exceeds the candidate context budget')
    out=Path(output);out.mkdir(parents=True,exist_ok=False)
    headers={'Content-Type':'application/json'}
    if os.environ.get('NETWORK_AI_BENCH_API_KEY'):
        headers['Authorization']='Bearer '+os.environ['NETWORK_AI_BENCH_API_KEY']
    models_req=urllib.request.Request(base+'/v1/models',headers=headers)
    with urllib.request.urlopen(models_req,timeout=10) as response: advertised=json.load(response)
    if model not in [entry['id'] for entry in advertised.get('data',[])]:
        raise ValueError('requested model is not advertised; refusing implicit model loading')
    samples=[];before=gpu_snapshot()
    for fixture in fixtures:
        body={'model':model,'messages':fixture['messages'],'stream':True,'stream_options':{'include_usage':True},
              'max_tokens':fixture['maximum_output_tokens'],'chat_template_kwargs':{'enable_thinking':False},
              **fixture['generation']}
        request=urllib.request.Request(base+'/v1/chat/completions',headers=headers,data=json.dumps(body).encode(),method='POST')
        start=time.perf_counter();first=None;finish=None;usage=None;done=False;content=[];error=None
        try:
            with urllib.request.urlopen(request,timeout=90) as response:
                for event in sse_payloads(response):
                    if time.perf_counter()-start>90:raise TimeoutError('profile deadline exceeded')
                    if event=='[DONE]':done=True;break
                    data=json.loads(event)
                    if data.get('usage'):usage=data['usage']
                    for choice in data.get('choices',[]):
                        delta=choice.get('delta',{}).get('content')
                        if delta:
                            if first is None:first=time.perf_counter()-start
                            content.append(delta)
                        if choice.get('finish_reason'):finish=choice['finish_reason']
        except Exception as exc:error=type(exc).__name__
        elapsed=time.perf_counter()-start
        counted_input=(usage or {}).get('prompt_tokens')
        counted_output=(usage or {}).get('completion_tokens')
        matched=(counted_input==fixture['prompt_tokens_with_template'])
        output_complete=(counted_output==fixture['maximum_output_tokens'])
        record={'profile':fixture['profile'],'sample':fixture['sample'],'warmup':fixture['warmup'],
                'ttft_visible_seconds':first,'elapsed_seconds':elapsed,'usage_reported':usage,'finish_reason':finish,
                'input_template_count_matches':matched,'requested_decode_count_reached':output_complete,
                'stream_done':done,'error_type':error,'synthetic_load_completed':done and matched and output_complete and error is None,
                'visible_output_sha256':sha256(''.join(content).encode()).hexdigest(),
                'reported_decode_tokens_per_second':counted_output/(elapsed-first) if counted_output and first is not None and elapsed>first else None}
        samples.append(record)
        print(json.dumps(record),flush=True)
        (out/'samples.json').write_text(json.dumps(samples,indent=2),encoding='utf-8')
    groups={}
    for profile in sorted({r['profile'] for r in samples}):
        rows=[r for r in samples if r['profile']==profile and not r['warmup']]
        timings=[r['ttft_visible_seconds'] for r in rows if r['ttft_visible_seconds'] is not None]
        rates=[r['reported_decode_tokens_per_second'] for r in rows if r['reported_decode_tokens_per_second'] is not None]
        groups[profile]={'samples':len(rows),'synthetic_loads_completed':sum(r['synthetic_load_completed'] for r in rows),
                         'ttft_p50_seconds':percentile(timings,.5),'ttft_p95_seconds':percentile(timings,.95),
                         'median_reported_decode_tokens_per_second':median(rates) if rates else None,
                         'semantic_quality_tested':False}
    report={'evidence_type':'MEASURED_LOCAL','observed_at_utc':datetime.now(timezone.utc).isoformat(),
            'model':model,'endpoint':base,'physical_hosts':1,'fixture_sha256':sha256(path.read_bytes()).hexdigest(),
            'harness_sha256':sha256(Path(__file__).read_bytes()).hexdigest(),'profiles':groups,
            'gpu_before':before,'gpu_after':gpu_snapshot(),'E01_fully_qualified':False,'public_launch_approved':False,
            'limitations':['Thirty samples per cell; no p99 or 1000-session qualification',
                           'Output token counts are engine counters; no independent output token-ID witness',
                           'Forced decode tests load and truncation, not semantic answer completeness',
                           'Before/after device memory snapshots do not measure the process peak',
                           'Remote physical host and engine cancellation still require separate evidence']}
    (out/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    return report
