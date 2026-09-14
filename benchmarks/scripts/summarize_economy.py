"""Validate the completed preregistered run set and emit a compact evidence index."""
from collections import Counter
from datetime import datetime,timezone
from hashlib import sha256
from pathlib import Path
import gzip
import json

ROOT=Path(__file__).resolve().parents[2]


def main():
    manifest=ROOT/'benchmarks/economy-study-v1.json'
    spec=json.loads(manifest.read_text())
    assert set(spec['calibration_seeds']).isdisjoint(spec['holdout_seeds'])
    records=[];total=0;passed=0;gate_failures=Counter();source_hashes=None
    baseline=[]
    for phase in ('calibration','holdout'):
        path=ROOT/f'benchmarks/runs/2026-09-14-economy-v1-{phase}'
        report=json.loads((path/'report.json').read_text())
        assert report['manifest_sha256']==sha256(manifest.read_bytes()).hexdigest()
        if source_hashes is not None:assert report['source_sha256']==source_hashes
        source_hashes=report['source_sha256']
        for file,digest in source_hashes.items():
            assert sha256((ROOT/'benchmarks/python/network_ai_bench'/file).read_bytes()).hexdigest()==digest
        assert report['raw_sha256']==sha256((path/'runs.jsonl.gz').read_bytes()).hexdigest()
        expected={(seed,scenario,variant) for seed in spec[phase+'_seeds'] for scenario in spec['scenarios'] for variant in spec['variants']}
        seen=set()
        with gzip.open(path/'runs.jsonl.gz','rt',encoding='utf-8') as stream:
            for line in stream:
                run=json.loads(line);key=(run['seed'],run['scenario'],run['variant'])
                assert key in expected and key not in seen
                seen.add(key)
                assert run['gates']['accounting_and_resource_invariants']
                assert len(run['daily'])==90
                for day in run['daily']:
                    assert day['exposure']==day['S']+day['L']+day['J']
                    assert min(day['working_free'],day['protected_free'],day['holds'])>=0
                total+=1;passed+=run['synthetic_candidate_passed']
                gate_failures.update(k for k,v in run['gates'].items() if not v)
        assert seen==expected and len(seen)==report['completed_runs']
        records.append({'phase':phase,'runs':len(seen),'report':str((path/'report.json').relative_to(ROOT)),
                        'raw':str((path/'runs.jsonl.gz').relative_to(ROOT)),'raw_sha256':report['raw_sha256']})
        if phase=='holdout':
            for variant in spec['variants']:
                group=report['groups']['steady_zero_buyers/'+variant]
                baseline.append({'variant':variant,'seeds':group['runs'],'passed':group['passed'],
                                 'funded_compatible_requests':group['funded'],'completed':group['completed'],
                                 'completion_fraction':group['completed']/group['funded'],
                                 'failed_gates':group['failed_gates']})
    result={'evidence_type':'SIMULATED','generated_at_utc':datetime.now(timezone.utc).isoformat(),
            'study_id':spec['study_id'],'manifest_sha256':sha256(manifest.read_bytes()).hexdigest(),
            'runs_verified':total,'synthetic_candidate_passed':passed,'synthetic_days_per_run':90,
            'calibration_seed_count':20,'holdout_seed_count':50,'scenarios':16,'variants':5,
            'accounting_and_resource_invariants_passed_in_all_runs':True,'gate_failures':dict(gate_failures),
            'baseline_holdout':baseline,'artifacts':records,'public_launch_approved':False,
            'decision':'REJECT_THE_TESTED_FICTIONAL_CONFIGURATION',
            'full_policy_acceptance_evaluated':False,
            'remaining_coverage':['Recovery within 24h after all prerequisites return requires an explicit event predicate and evaluator',
                                  'Elastic concurrency 1/2/4 and its fairness envelope are not part of this experiment',
                                  'Measured GPU costs and participant behavior must replace fictional inputs',
                                  'Independent READY attestation, federation/consensus and real operating finance are not modeled as proofs'],
            'interpretation':'A balanced ledger does not establish recurring liquidity or acceptable access. These runs reject this parameter set, not every possible cooperative design.'}
    out=ROOT/'docs/execution/evidence/economy-v1-summary.json'
    out.write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps({'report':str(out),'runs_verified':total,'candidate_passed':passed}))


if __name__=='__main__':main()
