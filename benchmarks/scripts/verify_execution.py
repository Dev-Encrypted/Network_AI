"""Verify F0 artifact consistency. This does not approve a public network."""
from collections import Counter
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from urllib.parse import unquote, urlsplit
from zipfile import ZipFile
import json
import re

ROOT = Path(__file__).resolve().parents[2]
HISTORICAL = {
    'NETWORK_AI_PLANEJAMENTO_2026-09-13.zip': 'f3b7f3bc51e942d797c903204ff8295b7198f6dbaef971c2167341b58d5054f3',
    'NETWORK_AI_PLANEJAMENTO_2026-09-13_v2_REDE_ABERTA.zip': '578ce6bd2421228e3349730044c1675fbe27504213bdc236c02e09164d3923b2',
    'NETWORK_AI_PLANEJAMENTO_2026-09-13_v3_COOPERATIVA.zip': '2d09fd6d51d2d6ecf38c9b886dda00126d08d7408882ebe26a4f9e0c364535c3',
    'NETWORK_AI_PLANEJAMENTO_2026-09-13_v4_CONTINUIDADE.zip': '81f46352213603311e8984517bad9deb8d557219d29df544b19b593115145f10',
    'NETWORK_AI_PLANEJAMENTO_2026-09-13_v5_PROGRAMA_FECHAMENTO.zip': 'e246c2ec9cc98e28d6825e9933138e6a98c8d848c4f8031267a82824a42658e4',
    'NETWORK_AI_PLANEJAMENTO_2026-09-13_v6_CONSOLIDADO.zip': '28b3a3d3da8a44b88b38bde98783f777bf5bf0283de3dfbed0e5607c6f41bd15',
}


def digest(path):
    with Path(path).open('rb') as stream:
        result = sha256()
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(block)
        return result.hexdigest()


def read(relative):
    return json.loads((ROOT / relative).read_text(encoding='utf-8-sig'))


def require(condition, description):
    if not condition:
        raise ValueError(description)


def validate():
    checks = []
    def checked(condition, description):
        require(condition, description)
        checks.append(description)

    for name, expected in HISTORICAL.items():
        checked(digest(ROOT / name) == expected, 'Historical archive unchanged: ' + name)
    with ZipFile(ROOT / next(reversed(HISTORICAL))) as archive:
        planning_files = [name for name in archive.namelist() if name.startswith('docs/planning/')]
        for name in planning_files:
            require((ROOT / name).read_bytes() == archive.read(name), 'Historical planning file changed: ' + name)
    checks.append(f'{len(planning_files)} planning files match the v6 snapshot byte for byte')

    fixture_meta = read('docs/execution/evidence/e01-fixtures.json')
    fixture_path = ROOT / fixture_meta['artifact']
    fixtures = [json.loads(line) for line in fixture_path.read_text().splitlines() if line]
    checked(digest(fixture_path) == fixture_meta['sha256'], 'E01 fixture hash matches')
    counts = Counter((row['profile'], row['warmup']) for row in fixtures)
    checked(counts == Counter({('2048/256', False): 30, ('2048/256', True): 3,
                               ('7168/1024', False): 30, ('7168/1024', True): 3}), 'E01 has two profiles with 30 measured and 3 warmup fixtures each')

    lm = read('benchmarks/runs/2026-09-14-lmstudio-visible-256/report.json')
    checked(lm['samples'] == lm['streams_completed'] == lm['correct_visible_answers'] == 30 and lm['length_cutoffs'] == 0,
            'LM Studio: 30 counted visible answers and no length cutoff')
    checked(digest(ROOT / 'benchmarks/python/network_ai_bench/http_bench.py') == lm['harness_sha256'], 'Corrected HTTP harness matches its report')
    checked(not lm['E01_Qwen3_8B_BF16_qualified'] and not lm['backend_cancellation_and_resource_reclamation_proven'], 'HTTP qualification limits remain explicit')

    transport = read('benchmarks/runs/2026-09-14-transport-loopback-release/report.json')
    checked(not transport['build_debug_assertions'] and len(transport['transports']) == 2, 'Both release transports are present')
    for row in transport['transports']:
        for field in ('oversized_request_rejected', 'replay_rejected', 'request_after_negative_checks_passed',
                      'unauthorized_peer_rejected', 'wrong_server_identity_rejected'):
            require(row[field] is True, row['transport'] + ': ' + field)
        require(row['physical_hosts'] == 1, 'Loopback must not be labeled two physical hosts')
        require({cell['payload_bytes'] for cell in row['samples_by_size']} == {1024, 16384, 65536}, 'Transport payload cells differ')
        require(all(cell['samples'] == 30 for cell in row['samples_by_size']), 'Transport sample count differs')
    checks.append('Transport payload cells, negative controls and physical-host scope match')

    petals = read('benchmarks/runs/2026-09-14-petals-private-cpu-v5-recovery/report.json')
    measured = [row for row in petals['forward_samples'] if not row['warmup']]
    checked(len(measured) == 30 and all(row['maximum_absolute_logit_error'] == 0 for row in measured), 'Petals: 30 measured forwards have identical logits')
    checked(len(petals['generation_checks']) == 3 and all(row['token_ids_equal'] for row in petals['generation_checks']), 'Petals: all three token sequences match')
    checked(petals['failure_detection_executed'] and petals['recovery_after_restart_executed'] and petals['recovery_maximum_absolute_logit_error'] == 0, 'Petals fault and recovery evidence is present')
    checked(not petals['GPU_used'] and not petals['public_swarm_joined'] and petals['physical_hosts'] == 1, 'Petals CPU/private/one-host limits remain explicit')
    checked(digest(ROOT / 'benchmarks/scripts/petals_private.py') == petals['harness_sha256'], 'Final Petals harness matches its report')

    kimi = read('docs/execution/evidence/kimi-k3/cpu-unit-load.json')
    checked(kimi['tensor_payload_bytes'] == 17547264 and len(kimi['tensors']) == 6, 'Kimi partial tensor payload matches')
    checked(not any(kimi[field] for field in ('whole_shard_digest_verified', 'dequantization_executed', 'expert_forward_executed',
                                               'gpu_load_executed', 'stage_parity_proven', 'complete_kimi_inference_executed')), 'Kimi partial load is not promoted to inference proof')

    summary = read('docs/execution/evidence/economy-v1-summary.json')
    spec_path = ROOT / 'benchmarks/economy-study-v1.json'
    spec = json.loads(spec_path.read_text())
    checked(set(spec['calibration_seeds']).isdisjoint(spec['holdout_seeds']), 'Economic calibration and holdout seeds are disjoint')
    checked(digest(spec_path) == summary['manifest_sha256'], 'Economic preregistration hash matches')
    for artifact in summary['artifacts']:
        report = read(artifact['report'].replace('\\', '/'))
        raw = ROOT / artifact['raw'].replace('\\', '/')
        require(digest(raw) == artifact['raw_sha256'] == report['raw_sha256'], 'Economic raw archive hash differs')
        require(report['manifest_sha256'] == summary['manifest_sha256'], 'Economic study manifest differs')
        for name, expected in report['source_sha256'].items():
            require(digest(ROOT / 'benchmarks/python/network_ai_bench' / name) == expected, 'Economic source changed since runs: ' + name)
    checked(summary['runs_verified'] == 5600 and summary['synthetic_candidate_passed'] == 0 and
            summary['decision'] == 'REJECT_THE_TESTED_FICTIONAL_CONFIGURATION' and not summary['full_policy_acceptance_evaluated'],
            'Economic rejection and incomplete policy coverage are preserved')

    for report in (lm, transport, petals, summary):
        require(report['public_launch_approved'] is False, 'No report may approve a public launch')
    checks.append('All principal run reports retain public_launch_approved=false')

    documents = [ROOT / 'README.md', ROOT / 'benchmarks/README.md', *sorted((ROOT / 'docs/execution').glob('*.md'))]
    links = 0
    for path in documents:
        for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)', path.read_text(encoding='utf-8-sig')):
            target = target.strip('<>')
            if urlsplit(target).scheme or target.startswith('#'):
                continue
            local = unquote(target.split('#')[0])
            require((path.parent / local).exists(), f'Broken local link in {path.name}: {target}')
            links += 1
    checks.append(f'{links} relative links in current execution documents resolve')
    return {'evidence_type': 'ARTIFACT_CONSISTENCY_CHECK', 'observed_at_utc': datetime.now(timezone.utc).isoformat(),
            'checks_passed': len(checks), 'checks': checks, 'public_launch_approved': False,
            'limitations': ['Does not rerun hardware experiments or validate every economic lifecycle predicate',
                            'Raw economic rows were separately evaluated by summarize_economy.py; this check binds their hashes',
                            'Hashes protect this local snapshot; they are not an independent timestamp or attestation',
                            'Model files and installed runtimes are excluded from the delivery ZIP and must be prepared separately']}


if __name__ == '__main__':
    result = validate()
    output = ROOT / 'docs/execution/evidence/execution-validation.json'
    output.write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps({'checks_passed': result['checks_passed'], 'public_launch_approved': False, 'report': str(output)}))
