"""Verify planning artifacts and arithmetic only; never runs inference or modifies product code."""
from pathlib import Path
from datetime import datetime, timezone
from decimal import Decimal
import gzip
import hashlib
import json
import math
import re
import sys
from urllib.parse import unquote, urlsplit

EVIDENCE = Path(__file__).resolve().parent
PLANNING = EVIDENCE.parent
ROOT = PLANNING.parent.parent
PREPARE = '--prepare' in sys.argv

def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

def sha(data):
    return hashlib.sha256(data).hexdigest()

model_records = []
for path in sorted(EVIDENCE.glob('*.json')):
    snapshot = read_json(path)
    if not isinstance(snapshot, dict) or 'weight_bytes' not in snapshot:
        continue
    weights = [f for f in snapshot['files'] if f['rfilename'].endswith('.safetensors')]
    total = sum(int(f['size']) for f in weights)
    assert total == int(snapshot['weight_bytes']), path.name
    assert len(weights) == snapshot['weight_files'], path.name
    assert re.fullmatch(r'[0-9a-f]{40}', snapshot['sha']), path.name
    assert snapshot['sha'] in (PLANNING / '05_MODELS_AND_DISTRIBUTION.md').read_text(encoding='utf-8')
    entry = {'model': snapshot['id'], 'revision': snapshot['sha'], 'weight_files': len(weights),
             'weight_bytes_declared': total, 'weight_GiB': total / 2**30,
             'weight_only_16GiB_units_lower_bound': math.ceil(total / (16 * 2**30)),
             'largest_file_bytes_declared': max(int(f['size']) for f in weights),
             'complete_weights_downloaded_or_verified': False}
    idx_path = EVIDENCE / (path.stem + '.index.json.gz')
    if idx_path.exists():
        index = json.loads(gzip.decompress(idx_path.read_bytes()).decode('utf-8-sig'))
        layers = {}
        for tensor, filename in index['weight_map'].items():
            match = re.match(r'^(?:language_model\.)?model\.layers\.(\d+)\.', tensor)
            if match:
                layers.setdefault(int(match.group(1)), set()).add(filename)
        summary = read_json(EVIDENCE / (path.stem + '.summary.json'))
        assert len(layers) == summary['layers'], path.name
        assert max(map(len, layers.values())) == summary['max_files_per_layer'], path.name
        entry.update(language_layers=len(layers), max_shards_per_language_layer=max(map(len, layers.values())))
    model_records.append(entry)
assert len(model_records) == 8

compression = read_json(EVIDENCE / 'compression-index.json')
for record in compression:
    compressed = (EVIDENCE / record['file']).read_bytes()
    raw = gzip.decompress(compressed)
    assert sha(compressed) == record['gzip_sha256']
    assert sha(raw) == record['raw_sha256']
    assert len(raw) == record['raw_bytes']
    json.loads(raw.decode('utf-8-sig'))
assert len(compression) == 7

capacity = []
k3 = next(r for r in model_records if r['model'] == 'moonshotai/Kimi-K3')
for count in (10, 100, 1000, 10000):
    online = count * 60 // 100
    accepted = online * 80 // 100
    reserved = accepted * 50 // 100
    ready = reserved * 90 // 100
    target = ready // 2
    equivalent = Decimal(target) * 16 * Decimal('0.85') / 2
    relaxed = math.floor(equivalent / Decimal(str(k3['weight_GiB'])))
    capacity.append(dict(registered=count, nominal_GiB=count*24, online=online, accepted=accepted,
                         reserved=reserved, ready=ready, ready_target=target,
                         equivalent_weight_budget_GiB=str(equivalent), relaxed_redundant_K3_sets=relaxed))
assert [r['ready'] for r in capacity] == [1, 21, 216, 2160]
assert [r['relaxed_redundant_K3_sets'] for r in capacity] == [0, 0, 0, 5]
kv = 2*36*8*128*2*8192
assert kv / 2**30 == 1.125
relay = []
for sessions, mb, pct in ((100,2,20),(5000,5,40),(50000,10,60),(500000,10,60)):
    relay.append(str(Decimal(sessions)*30*mb*pct/100/1000))
assert relay == ['1.2', '300', '9000', '90000']
calculations = {
    'evidence_type': 'CALCULATED_PROJECTION',
    'no_gpu_or_network_benchmark_executed': True,
    'model_metadata_arithmetic': model_records,
    'homogeneous_24GiB_scenarios': capacity,
    'qwen8b_KV_bytes_8192_tokens_one_session': kv,
    'qwen8b_total_GiB_with_hypothetical_3GiB_overhead': 16381516776/2**30 + kv/2**30 + 3,
    'activation_8192x7168_BF16_MiB': 8192*7168*2/2**20,
    'activation_min_seconds_at_100Mbit': 8192*7168*2*8/100e6,
    'illustrative_93_stage_network_seconds_per_token': 93*0.05,
    'illustrative_network_only_tokens_per_second': 1/(93*0.05),
    'illustrative_independent_93_component_availability': 0.99**93,
    'relay_useful_GB_per_month_scenarios': relay,
    'R2_gross_storage_USD_excludes_allowances_operations_taxes': {
        str(n): str(Decimal(n)*Decimal('0.015')) for n in (1000,5000,20000,50000)},
    'daily_example_supply_units': 100*6+60*12+40*6,
    'daily_example_demand_units': 20*6+50*12+100*6,
    'daily_example_peak_shortfall_units': (100-40)*6,
    'ledger_example_payment_atomic': {'unit':'FICTIONAL_PAYMENT_UNIT', 'earned':600000, 'hold':400000, 'consumed':250000,
        'released':150000, 'available':350000, 'refund':50000, 'final_available':400000},
    'index_compression_raw_bytes': sum(r['raw_bytes'] for r in compression),
    'index_compression_gzip_bytes': sum(r['compressed_bytes'] for r in compression),
}
write_json(EVIDENCE / 'calculated-projections.json', calculations)

markdown = [ROOT / 'README.md'] + sorted(PLANNING.glob('*.md')) + [EVIDENCE / 'README.md']
diagrams_dir = EVIDENCE / 'diagrams'
diagrams_dir.mkdir(exist_ok=True)
diagrams = []
fences = []
for path in markdown:
    content = path.read_text(encoding='utf-8')
    assert '\ufffd' not in content, path.name
    assert len(content) > 200, path.name
    opened = None
    body = []
    serial = 0
    for line_num, line in enumerate(content.splitlines(), 1):
        marker = re.match(r'^\s*```(.*)$', line)
        if marker:
            if opened is None:
                opened = (marker.group(1).strip(), line_num)
                body = []
            else:
                assert marker.group(1).strip() == '', (path.name,line_num)
                lang, first = opened
                block = '\n'.join(body) + '\n'
                fences.append({'file':path.name, 'language':lang, 'line':first})
                if lang == 'json':
                    json.loads(block)
                if lang == 'mermaid':
                    serial += 1
                    target = diagrams_dir / f'{path.stem}-{serial:02}.mmd'
                    target.write_text(block, encoding='utf-8')
                    diagrams.append({'file':str(target.relative_to(ROOT)).replace('\\','/'), 'sha256':sha(target.read_bytes())})
                opened = None
        elif opened is not None:
            body.append(line)
    assert opened is None, path.name

if PREPARE:
    print(json.dumps({'prepared_models':len(model_records),'prepared_diagrams':len(diagrams),
                      'arithmetic_checks':'passed','compression_round_trip':'passed'}))
    raise SystemExit(0)

mandatory = ['01_PRODUCT_VISION.md','02_RESEARCH_AND_COMPARISON.md','03_ARCHITECTURE.md',
    '04_TECH_STACK_AND_ADRS.md','05_MODELS_AND_DISTRIBUTION.md','06_NODE_PROTOCOL_AND_SCHEDULER.md',
    '07_CREDITS_AND_LEDGER.md','08_SECURITY_AND_TRUST.md','09_DATA_MODEL_AND_APIS.md',
    '10_BENCHMARKS_AND_CAPACITY.md','11_OPERATIONS_AND_ECONOMICS.md','12_ROADMAP_AND_BACKLOG.md']
assert all((PLANNING/name).is_file() for name in mandatory)
assert not any((ROOT/d).exists() for d in ['apps','services','packages','infra','adapters','crates'])
backlog = (PLANNING/'12_ROADMAP_AND_BACKLOG.md').read_text(encoding='utf-8')
items = re.findall(r'^\| (B\d{3})\b', backlog, re.M)
assert items == [f'B{i:03}' for i in range(1,59)]
assert len(re.findall(r'^### EP\d+',backlog,re.M)) == 11
report_path = EVIDENCE/'validation-report.json'
hash_path = EVIDENCE/'SHA256SUMS.txt'
report_path.write_text('{}\n',encoding='utf-8')
hash_path.touch(exist_ok=True)
local_links = 0
external_urls = set()
for path in markdown:
    for label, target in re.findall(r'\[([^\]]+)\]\(([^\)]+)\)',path.read_text(encoding='utf-8')):
        target = target.strip('<>')
        url = urlsplit(target)
        if url.scheme in ('http','https'):
            external_urls.add(target)
            continue
        if not url.path:
            continue
        resolved = (path.parent/unquote(url.path)).resolve()
        assert resolved.exists(), (path.name,label,target)
        local_links += 1
json_count = 0
for path in EVIDENCE.glob('*.json'):
    read_json(path)
    json_count += 1
jsonl_lines = 0
for path in EVIDENCE.glob('*.jsonl'):
    for line in path.read_text(encoding='utf-8-sig').splitlines():
        if line.strip():
            json.loads(line)
            jsonl_lines += 1
mermaid_report = read_json(EVIDENCE/'mermaid-validation.json')
assert mermaid_report['status'] == 'passed'
assert len(mermaid_report['diagrams']) == len(diagrams)
assert {d['sha256'] for d in mermaid_report['diagrams']} == {d['sha256'] for d in diagrams}
token_report = read_json(EVIDENCE/'token-economy-simulations.json')
token_policy = read_json(EVIDENCE/'token-economy-policy.json')
assert token_report['status'] == 'passed_arithmetic'
assert token_report['case_count'] == len(token_report['cases']) == 18
assert [c['id'] for c in token_report['cases']] == [f'T{i:02}' for i in range(1,19)]
assert all(c['status'] == 'passed_arithmetic' and c['limitation'] for c in token_report['cases'])
assert token_policy['unit'] == 'TU' and token_policy['micro_units_per_unit'] == 1000000
assert token_report['policy_version'] == token_policy['policy_version']
assert token_report['policy_sha256'] == sha((EVIDENCE/'token-economy-policy.json').read_bytes())
assert token_report['simulator_sha256'] == sha((EVIDENCE/'simulate_token_economy.py').read_bytes())
market_report = read_json(EVIDENCE/'open-market-simulations.json')
market_policy = read_json(EVIDENCE/'open-market-policy.json')
assert market_report['status'] == 'passed_arithmetic'
assert market_report['case_count'] == len(market_report['cases']) == 8
assert [c['id'] for c in market_report['cases']] == [f'M{i:02}' for i in range(1,9)]
assert all(c['status'] == 'passed_arithmetic' and c['limitation'] for c in market_report['cases'])
assert market_report['policy_version'] == market_policy['policy_version']
assert market_report['policy_sha256'] == sha((EVIDENCE/'open-market-policy.json').read_bytes())
assert market_report['simulator_sha256'] == sha((EVIDENCE/'simulate_open_market.py').read_bytes())
assert market_policy['gain_requires_funded_counterparty'] is True
assert market_policy['payment_transfers_instead_of_burns'] is True
assert token_policy['status'].startswith('historical_')
assert market_policy['billing_mode'] == 'commercial'
assert market_policy['display_unit'] == 'UP_FICTIONAL_PAYMENT_UNIT'
coop_report = read_json(EVIDENCE/'cooperative-elastic-simulations.json')
coop_policy = read_json(EVIDENCE/'cooperative-elastic-policy.json')
assert coop_report['status'] == 'passed_reference'
assert coop_report['case_count'] == len(coop_report['cases']) == 20
assert [c['id'] for c in coop_report['cases']] == [f'A{i:02}' for i in range(1,21)]
assert all(c['status'] == 'passed_reference' and c['limitation'] for c in coop_report['cases'])
assert coop_report['policy_version'] == coop_policy['policy_version']
assert coop_report['policy_sha256'] == sha((EVIDENCE/'cooperative-elastic-policy.json').read_bytes())
assert coop_report['simulator_sha256'] == sha((EVIDENCE/'simulate_cooperative_elastic.py').read_bytes())
assert coop_policy['cooperative_unit'] == 'TU' and coop_policy['microtu_per_tu'] == 1000000
assert coop_policy['cooperative_earnings_require_paid_buyers'] is False
assert coop_policy['cooperative_credit_cash_conversion'] is False
assert coop_policy['automatic_billing_mode_fallback'] is False
assert coop_policy['elastic']['quota_is_bankable'] is False
assert coop_policy['elastic']['concurrency_levels'] == [1, 2, 4]
integrated = read_json(EVIDENCE/'integrated-economy-simulations.json')
integrated_policy = read_json(EVIDENCE/'integrated-economy-policy.json')
assert integrated['status'] == 'passed_model_invariants_not_real_world_validation'
assert integrated['policy_version'] == integrated_policy['policy_version']
assert integrated['policy_sha256'] == sha((EVIDENCE/'integrated-economy-policy.json').read_bytes())
assert integrated['simulator_sha256'] == sha((EVIDENCE/'simulate_integrated_economy.py').read_bytes())
assert integrated['base_runs'] == len(integrated['runs']) == 33
assert integrated['control_runs'] == len(integrated['controls']) == 9
assert integrated['sensitivity_runs'] == len(integrated['sensitivities']) == 12
assert integrated['total_runs'] == 54 and integrated['scenario_count'] == 11
assert integrated['days_per_run'] == 90
assert [c['id'] for c in integrated['boundary_cases']] == [f'C{i:02}' for i in range(1,8)]
assert all(c['status'] == 'passed_reference' for c in integrated['boundary_cases'])
all_integrated_runs = integrated['runs'] + integrated['controls'] + integrated['sensitivities']
for run in all_integrated_runs:
    assert run['invariants'] == 'passed' and run['hours'] == 2160
    assert sum(run['state_hours'].values()) == 2160
    assert [d['day'] for d in run['daily']] == list(range(1,91))
    assert run['resource_partition_checks'] == 4320
    assert run['final_service_stock_microtu'] == run['initial_service_stock_microtu'] + run['issued_microtu'] - run['burned_microtu']
    metrics = run['metrics']
    assert metrics.get('served_cost_microtu',0) == metrics.get('recycled_consumption_microtu',0) + run['burned_microtu']
    assert run['issued_microtu'] == metrics.get('ordinary_rewards_microtu',0) + metrics.get('reserve_topups_microtu',0) + metrics.get('undetected_fraud_microtu',0)
    assert run['final_reserve_microtu'] == integrated_policy['fictional_simulation']['initial_continuity_microtu'] + metrics.get('reserve_topups_microtu',0) + metrics.get('recycled_consumption_microtu',0) - metrics.get('continuity_rewards_microtu',0) - metrics.get('circulated_rewards_microtu',0)
    if run['scenario'] != 'mixed_commercial':
        assert run['payment_total_units'] == 0 and metrics.get('commercial_payment_units',0) == 0
assert all(not r['recycling_enabled'] for r in integrated['controls'])
assert all(r['recycling_enabled'] for r in integrated['runs'])
assert len(integrated['recycling_comparison']) == 9
for pair in integrated['recycling_comparison']:
    assert pair['difference'] == round(pair['with_recycling_service_fraction']-pair['without_recycling_service_fraction'],6)
assert integrated_policy['service_registry']['choice'] == 'CometBFT'
assert integrated_policy['service_registry']['reference_release'] == 'v0.38.26'
assert integrated['public_activation_gate']['status'] == 'rejected_fictional_parameter_set'
assert integrated['public_activation_gate']['baseline_economic_hibernation_hours_max'] > 0
assert not integrated['public_activation_gate']['real_eligible_request_slo_measured']
integrated_text = (PLANNING/'23_INTEGRATED_ECONOMY_SIMULATIONS.md').read_text(encoding='utf-8')
for summary in integrated['summary']:
    for key in ('service_fraction_min','service_fraction_max'):
        assert f"{summary[key]*100:.2f}".replace('.',',') in integrated_text
rejected_path = EVIDENCE/'rejected-draft'
rejected = read_json(rejected_path/'integrated-economy-simulations.json')
assert rejected['policy_sha256'] == sha((rejected_path/'integrated-economy-policy.json').read_bytes())
assert rejected['simulator_sha256'] == sha((rejected_path/'simulate_integrated_economy.py').read_bytes())
closure = read_json(EVIDENCE/'closure-register.json')
closure_text = (PLANNING/'24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md').read_text(encoding='utf-8')
assert closure['revision'] == 'planning-closure-program-2026-09-13-v6'
assert closure['scope'] == 'specified_policy_with_bounded_reference_checks_not_integrated_validation'
assert closure['previous_simulation_revision'] == integrated['policy_version']
assert closure['public_launch_approved'] is False
assert closure['new_integrated_economic_simulation_executed'] is False
funds = closure['proposed_funds']
assert funds['unit'] == 'TU'
assert len({funds[k] for k in ('aggregate','protected','working')}) == 3
assert all(funds[k] in closure_text for k in ('aggregate','protected','working'))
assert funds['protected_target_hours'] == 72 and funds['working_target_reference_hours'] == 24
assert funds['working_floor_reference_hours'] == 6 and funds['working_target_must_cover_floor'] is True
assert funds['refill_order'] == ['working_floor','protected_target','working_target','burn']
assert funds['protected_funds_normal_expansion_allowed'] is False
assert funds['new_issuance_cap_unchanged'] is True
assert closure['ordinary_notice_hours'] == 48
for name in ('16_TOKEN_ECONOMY_AND_FAIR_DISTRIBUTION.md','22_POLICY_CLOSURE_AND_CONTINUITY.md'):
    policy_text = (PLANNING/name).read_text(encoding='utf-8')
    assert re.search(r'aviso (?:m[ií]nimo )?de 48 h',policy_text), name
    assert not re.search(r'aviso (?:m[ií]nimo )?de 24 h',policy_text), name
assert closure['receipt_accounting'] == {
    'unissued_commitment':'L', 'existing_tu_held':'S', 'approved_unposted_burn_reversal':'J'}
bench = closure['commercial_bench']
assert bench['protocol'] == 'x402' and bench['scheme'] == 'batch-settlement'
assert bench['network'] == 'eip155:84532' and bench['asset_label'] == 'USDC_TEST_ONLY'
assert bench['sdk_language'] == 'TypeScript'
assert all(bench[k] is False for k in ('deployed_contract_qualified','facilitator_qualified',
    'actual_funds_transferred','tu_conversion_allowed'))
assert bench['core_requires_financial_chain'] is False
assert bench['seller_responsible_for_complete_route'] is True
v6_policy_path = EVIDENCE/closure['operating_policy_file']
v6_policy = read_json(v6_policy_path)
v6_reference = read_json(EVIDENCE/closure['bounded_reference_file'])
assert v6_policy['policy_version'] == 'planning-operating-policy-2026-09-13-v6'
assert v6_policy['status'] == 'candidate_specification_not_runtime_configuration'
assert v6_policy['funds']['refill_order'] == funds['refill_order']
assert v6_policy['funds']['working_floor_reference_hours'] == funds['working_floor_reference_hours']
assert v6_policy['funds']['protected_can_fund_normal_expansion'] is False
assert v6_policy['funds']['aggregate_accepts_postings'] is False
assert v6_policy['credit_cash_conversion'] is False
assert v6_policy['paid_buyers_required_for_cooperation'] is False
assert v6_policy['validation']['mature_ordinary_new_issuance_allowed'] is False
assert v6_policy['validation']['mature_extraordinary_support_allowed'] is False
assert v6_policy['validation']['mature_participant_liquidity_and_access_must_not_deteriorate_continuously'] is True
assert v6_policy['validation']['controls_reimplemented_in_common_event_model'] is True
assert v6_policy['validation']['integrated_simulation_executed'] is False
assert v6_policy['validation']['public_launch_approved'] is False
assert v6_reference['policy_version'] == v6_policy['policy_version']
assert v6_reference['policy_sha256'] == sha(v6_policy_path.read_bytes())
assert v6_reference['checker_sha256'] == sha((EVIDENCE/'verify_v6_policy_reference.py').read_bytes())
assert v6_reference['status'] == 'passed_bounded_reference_checks'
assert v6_reference['case_count'] == len(v6_reference['cases']) == closure['bounded_reference_cases_executed'] == 19
assert [c['id'] for c in v6_reference['cases']] == [f'Q{i:02}' for i in range(1,20)]
assert all(c['status'] == 'passed_reference' and c['observed'] == c['expected'] and c['limitation'] for c in v6_reference['cases'])
assert v6_reference['integrated_economic_simulation_executed'] is False
assert v6_reference['hardware_or_payment_execution'] is False
assert v6_reference['public_launch_approved'] is False
gates = closure['gates']
assert [g['id'] for g in gates] == [f'FC{i:02}' for i in range(1,7)]
gate_map = {g['id']:g for g in gates}
for gate in gates:
    assert set(gate['depends_on']) <= set(gate_map), gate['id']
    assert len(gate['depends_on']) == len(set(gate['depends_on'])), gate['id']
    assert gate['owner_role'] and gate['decision_status'] and gate['validation_status']
    assert gate['validation_status'] not in ('validated','passed','complete','approved')
    assert gate['id'] in closure_text
seen_gates = set()
def visit_gate(gate_id, ancestors):
    assert gate_id not in ancestors, ('cyclic closure dependency', gate_id)
    if gate_id in seen_gates:
        return
    for dependency in gate_map[gate_id]['depends_on']:
        visit_gate(dependency, ancestors | {gate_id})
    seen_gates.add(gate_id)
for gate in gates:
    visit_gate(gate['id'], set())
required_gates = closure['activation_requires']
assert set(required_gates['cooperative']) == seen_gates - {'FC04'}
assert set(required_gates['commercial']) == seen_gates
report = {'status':'passed','observed_at_utc':datetime.now(timezone.utc).isoformat(),
    'scope':'planning artifacts only; no product, GPU, network or database execution',
    'mandatory_documents':len(mandatory),'markdown_documents':len(markdown),
    'local_links_checked':local_links,'external_urls_referenced':len(external_urls),
    'external_links_all_revalidated_by_this_script':False,
    'balanced_fenced_blocks':len(fences),'embedded_json_examples_valid':True,
    'json_files_parsed':json_count,'jsonl_records_parsed':jsonl_lines,
    'model_snapshots_verified_against_declared_metadata':len(model_records),
    'gzip_round_trip_sha256_verified':len(compression),
    'mermaid_parser':mermaid_report['parser'],'mermaid_diagrams_parsed':len(diagrams),
    'mermaid_visual_layout_reviewed':False,
    'backlog_items':len(items),'backlog_epics':11,
    'token_economy_arithmetic_cases':len(token_report['cases']),
    'token_policy_and_simulator_hashes_verified':True,
    'open_market_arithmetic_cases':len(market_report['cases']),
    'open_market_policy_and_simulator_hashes_verified':True,
    'cooperative_reference_cases':len(coop_report['cases']),
    'cooperative_policy_and_simulator_hashes_verified':True,
    'integrated_economy_runs':len(all_integrated_runs),
    'integrated_economy_scenarios':integrated['scenario_count'],
    'integrated_economy_boundary_references':len(integrated['boundary_cases']),
    'integrated_economy_hashes_and_report_conservation_verified':True,
    'integrated_economy_public_activation_gate':integrated['public_activation_gate']['status'],
    'rejected_draft_integrity_verified':True,
    'closure_program_revision':closure['revision'],
    'closure_gates_specified':len(gates),
    'closure_gate_dependencies_checked':True,
    'operating_policy_revision':v6_policy['policy_version'],
    'v6_bounded_reference_cases':len(v6_reference['cases']),
    'v6_reference_policy_and_checker_hashes_verified':True,
    'new_integrated_economic_simulation_executed':False,
    'public_launch_approved':False,
    'commercial_and_cooperative_modes_separated':True,
    'arithmetic_checks':'passed','product_directories_created':False}
write_json(report_path,report)
lines = []
files = [ROOT/'README.md'] + sorted(p for p in (ROOT/'docs').rglob('*') if p.is_file() and p != hash_path)
for path in files:
    lines.append(f'{sha(path.read_bytes())}  {str(path.relative_to(ROOT)).replace(chr(92),"/")}')
hash_path.write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
