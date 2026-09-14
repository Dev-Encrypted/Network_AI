"""Two private CPU block servers and a local numerical reference on ONE host.

Uses the isolated, pinned Petals environment. Never joins a public swarm.
"""
from datetime import datetime,timezone
from hashlib import sha256
from pathlib import Path
import argparse
import json
import os
import signal
import subprocess
import sys
import time
import uuid

os.environ.update({'HF_HUB_OFFLINE':'1','HF_HUB_DISABLE_TELEMETRY':'1','CUDA_VISIBLE_DEVICES':'',
                   'OMP_NUM_THREADS':'1','MKL_NUM_THREADS':'1','TOKENIZERS_PARALLELISM':'false',
                   'PETALS_MAX_RETRIES':'1'})
ROOT=Path(__file__).resolve().parents[2]
MODEL=ROOT/'.models/bloom-560m-ac2ae5fab2ce3f9f40dc79b5ca9f637430d24971'
PROMPTS=['A cat sat on the','Era uma vez uma pequena cidade','The sequence is one, two, three,']
ABS_TOLERANCE=0.001  # Fixed before executing the first reference comparison.


def worker(config_path,blocks):
    import torch
    from petals.server.server import Server
    from petals.utils.convert_block import QuantType
    torch.set_num_threads(1)
    config=json.loads(Path(config_path).read_text())
    assert all(p.startswith('/ip4/127.0.0.1/') for p in config['initial_peers'])
    def interrupt(signum,frame): raise KeyboardInterrupt
    signal.signal(signal.SIGTERM,interrupt)
    server=Server(initial_peers=config['initial_peers'],dht_prefix=config['prefix'],
                  converted_model_name_or_path=str(MODEL),throughput=1.0,block_indices=blocks,
                  device='cpu',torch_dtype='float32',quant_type=QuantType.NONE,num_handlers=1,
                  inference_max_length=128,attn_cache_tokens=256,max_batch_size=128,
                  max_alloc_timeout=2,max_chunk_size_bytes=8*1024*1024,cache_dir=str(ROOT/'.runtime/petals-cache'),
                  host_maddrs=['/ip4/127.0.0.1/tcp/0'],use_relay=False,use_auto_relay=False,
                  reachable_via_relay=False,skip_reachability_check=True,update_period=1,
                  balance_quality=0,request_timeout=10,session_timeout=30,step_timeout=10)
    try: server.run()
    except KeyboardInterrupt: pass
    finally: server.shutdown()


def stop(process):
    if process.poll() is not None: return
    process.terminate()
    try: process.wait(timeout=12)
    except subprocess.TimeoutExpired:
        # This process group was created exclusively for this bench worker.
        os.killpg(process.pid,signal.SIGKILL)
        process.wait(timeout=5)


def bench(output):
    import torch
    import hivemind
    import petals
    import transformers
    from transformers import AutoTokenizer,AutoModelForCausalLM
    from petals import AutoDistributedModelForCausalLM,AutoDistributedConfig
    from petals.models.bloom.model import DistributedBloomForCausalLM
    from petals.data_structures import ServerState
    from petals.utils.dht import get_remote_module_infos
    torch.set_num_threads(1)
    torch.manual_seed(20260914)
    out=Path(output);out.mkdir(parents=True,exist_ok=False)
    report={'evidence_type':'MEASURED_LOCAL_CPU_PRIVATE_SWARM','physical_hosts':1,'block_servers':2,
            'model':'bigscience/bloom-560m','revision':'ac2ae5fab2ce3f9f40dc79b5ca9f637430d24971',
            'petals_commit':'22afba627a7eb4fcfe9418c49472c6a51334b8ac','petals_version':petals.__version__,
            'torch_version':torch.__version__,'transformers_version':transformers.__version__,
            'precommitted_max_absolute_logit_error':ABS_TOLERANCE,'public_swarm_joined':False,
            'routing_throughput_hint_is_measured':False,'GPU_used':False,'public_launch_approved':False,
            'started_at_utc':datetime.now(timezone.utc).isoformat(),
            'harness_sha256':sha256(Path(__file__).read_bytes()).hexdigest(),
            'limitations':['One physical computer; no LAN/WAN or independent operators',
                           'BLOOM-560m CPU is a research reference, not a Kimi proof or the Qwen service engine',
                           'The pinned upstream contains an always-true resume-position assert; resume metadata is not qualified',
                           'Private loopback and synthetic inputs only; no public API or credit issuance']}
    (out/'preregistration.json').write_text(json.dumps(report,indent=2))
    dht=None;remote=None;processes=[];logs=[]
    try:
        dht=hivemind.DHT(initial_peers=[],host_maddrs=['/ip4/127.0.0.1/tcp/0'],
                         use_relay=False,use_auto_relay=False,start=True,num_workers=2)
        peers=[str(p) for p in dht.get_visible_maddrs()]
        assert peers and all(p.startswith('/ip4/127.0.0.1/') for p in peers)
        config={'initial_peers':peers,'prefix':'network-ai-f0-'+uuid.uuid4().hex}
        config_path=out/'private-swarm.json';config_path.write_text(json.dumps(config))
        def start_worker(blocks,label):
            log=(out/f'{label}.log').open('w');logs.append(log)
            process=subprocess.Popen([sys.executable,str(Path(__file__).resolve()),'--worker',str(config_path),'--blocks',blocks],
                                     stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
            processes.append(process);return process
        def ready():
            deadline=time.monotonic()+120
            while time.monotonic()<deadline:
                infos=get_remote_module_infos(dht,[f"{config['prefix']}.{i}" for i in range(24)],latest=True)
                if all(any(s.state==ServerState.ONLINE for s in info.servers.values()) for info in infos):
                    return sorted({peer.to_base58() for info in infos for peer,s in info.servers.items() if s.state==ServerState.ONLINE})
                if any(p.poll() is not None for p in processes):
                    raise RuntimeError('a private worker exited before readiness; inspect worker logs')
                time.sleep(1)
            raise TimeoutError('private blocks did not become ready in 120 seconds')
        first=start_worker('0:12','blocks-0-11')
        second=start_worker('12:24','blocks-12-23')
        allowed=ready()
        assert len(allowed)==2
        print(json.dumps({'private_servers_ready':2,'physical_hosts':1}),flush=True)
        tokenizer=AutoTokenizer.from_pretrained(MODEL,local_files_only=True)
        reference=AutoModelForCausalLM.from_pretrained(MODEL,torch_dtype=torch.float32,
                         local_files_only=True,use_safetensors=True,trust_remote_code=False).eval()
        remote_config=AutoDistributedConfig.from_pretrained(str(MODEL),initial_peers=peers,dht_prefix=config['prefix'],
                         allowed_servers=allowed,max_retries=1,request_timeout=10,connect_timeout=3,
                         update_period=1,show_route=False,use_server_to_server=True)
        # The CausalLM wrapper owns its client DHT. The pinned config provides
        # only this private loopback swarm and an explicit server allowlist.
        remote=DistributedBloomForCausalLM.from_pretrained(str(MODEL),config=remote_config,
                         torch_dtype=torch.float32,local_files_only=True,use_safetensors=True,trust_remote_code=False).eval()
        samples=[]
        with torch.no_grad():
            for i in range(33):
                inputs=tokenizer(PROMPTS[i%len(PROMPTS)],return_tensors='pt')
                started=time.perf_counter();expected=reference(**inputs,use_cache=True).logits
                local_seconds=time.perf_counter()-started
                started=time.perf_counter();actual=remote(**inputs,use_cache=True).logits
                remote_seconds=time.perf_counter()-started
                delta=(expected-actual).abs()
                item={'sample':i,'warmup':i<3,'local_seconds':local_seconds,'remote_seconds':remote_seconds,
                      'maximum_absolute_logit_error':float(delta.max()),
                      'last_token_argmax_equal':bool(torch.equal(expected[:,-1].argmax(-1),actual[:,-1].argmax(-1)))}
                samples.append(item)
                if i%5==0:print(json.dumps(item),flush=True)
                assert item['maximum_absolute_logit_error']<=ABS_TOLERANCE and item['last_token_argmax_equal']
            generations=[]
            for prompt in PROMPTS:
                inputs=tokenizer(prompt,return_tensors='pt')
                expected=reference.generate(**inputs,max_new_tokens=8,do_sample=False)
                actual=remote.generate(**inputs,max_new_tokens=8,do_sample=False)
                equal=bool(torch.equal(expected,actual))
                generations.append({'prompt':prompt,'token_ids_equal':equal,'new_token_count':actual.shape[1]-inputs['input_ids'].shape[1]})
                assert equal,'greedy generation diverged'
        report.update({'forward_samples':samples,'generation_checks':generations,'numerical_checks_passed':True})
        # Drop a worker after successful sessions. Retries and deadlines are bounded.
        stop(second)
        started=time.monotonic()
        try:
            with torch.no_grad():remote(**tokenizer(PROMPTS[0],return_tensors='pt'),use_cache=True)
        except Exception as error:
            report['missing_block_error']={'type':type(error).__name__,'seconds':time.monotonic()-started}
        else:raise AssertionError('request unexpectedly succeeded after removing half the blocks')
        report['failure_detection_executed']=True
        processes.remove(second)
        restarted_at=time.monotonic()
        start_worker('12:24','blocks-12-23-restarted')
        recovered_allowed=ready()
        manager=remote.transformer.h.sequence_manager
        # The lab controller knows both processes; it authorizes the replacement
        # key explicitly. This is not proof of permissionless identity recovery.
        manager.allowed_servers={hivemind.PeerID.from_base58(peer) for peer in recovered_allowed}
        manager.update(wait=True)
        with torch.no_grad():
            inputs=tokenizer(PROMPTS[0],return_tensors='pt')
            expected=reference(**inputs,use_cache=True).logits
            actual=remote(**inputs,use_cache=True).logits
            recovery_error=float((expected-actual).abs().max())
            assert recovery_error<=ABS_TOLERANCE
        report['recovery_after_restart_executed']=True
        report['recovery_seconds']=time.monotonic()-restarted_at
        report['recovery_maximum_absolute_logit_error']=recovery_error
        report['replacement_identity_authorized_by_local_lab_controller']=True
        report['finished_at_utc']=datetime.now(timezone.utc).isoformat()
    except Exception as error:
        report['run_error']={'type':type(error).__name__,'message':str(error)}
        raise
    finally:
        for process in processes:stop(process)
        if remote is not None:
            remote.transformer.h.sequence_manager.shutdown()
            client_dht=remote.transformer.h.sequence_manager.dht
            client_dht.shutdown();client_dht.join(timeout=10)
        if dht is not None:dht.shutdown();dht.join(timeout=10)
        for log in logs:log.close()
        (out/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({'report':str(out/'report.json'),'numerical_checks_passed':report['numerical_checks_passed']}))


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--worker');parser.add_argument('--blocks');parser.add_argument('--output')
    args=parser.parse_args()
    if args.worker:worker(args.worker,args.blocks)
    else:
        if not args.output:parser.error('--output is required')
        bench(args.output)


if __name__=='__main__':main()
