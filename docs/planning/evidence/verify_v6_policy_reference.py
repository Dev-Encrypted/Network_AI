"""Bounded planning reference checks; no product ledger, inference or market simulation."""
from pathlib import Path
from fractions import Fraction
import hashlib
import json

HERE = Path(__file__).resolve().parent
POLICY_PATH = HERE / 'operating-policy-v6.json'
POLICY = json.loads(POLICY_PATH.read_text(encoding='utf-8'))
MAXIMUM = int(POLICY['maximum_stored_integer'])
cases = []

def integers(*values):
    if any(type(value) is not int or not 0 <= value <= MAXIMUM for value in values):
        raise ValueError('nonnegative bounded integers required')

def refill(q, working, protected, floor, working_target, protected_target):
    integers(q, working, protected, floor, working_target, protected_target)
    if floor > working_target:
        raise ValueError('working target must cover the floor')
    a = min(q, max(0, floor - working))
    p = min(q - a, max(0, protected_target - protected))
    w = min(q - a - p, max(0, working_target - working - a))
    b = q - a - p - w
    result = {'floor':a, 'protected':p, 'working_extra':w, 'burn':b,
              'working_after':working+a+w, 'protected_after':protected+p}
    integers(*result.values())
    assert a+p+w+b == q
    assert result['working_after']+result['protected_after']-(working+protected) == q-b
    return result

def legacy_refill(q, working, protected, working_target, protected_target):
    p = min(q, max(0, protected_target-protected))
    w = min(q-p, max(0, working_target-working))
    return {'working_after':working+w, 'protected_after':protected+p, 'burn':q-p-w}

def expansion(working, protected, floor, protected_target, working_hold, demand, complete_route):
    integers(working, protected, floor, protected_target, working_hold)
    return bool(demand and complete_route and working >= working_hold
                and working-working_hold >= floor and protected >= protected_target)

def recurring(recycled, normal_cost):
    integers(recycled, normal_cost)
    if normal_cost == 0:
        raise ValueError('empty workload cannot demonstrate steady operation')
    ratio = Fraction(recycled, normal_cost)
    return {'numerator':ratio.numerator, 'denominator':ratio.denominator,
            'deficit':max(0,normal_cost-recycled), 'covers_normal_cost':recycled >= normal_cost}

def record(name, observed, expected):
    assert observed == expected, (name, observed, expected)
    cases.append({'id':f'Q{len(cases)+1:02}', 'name':name, 'observed':observed,
                  'expected':expected, 'status':'passed_reference',
                  'limitation':'bounded arithmetic or admission predicate, not an implemented ledger or economic equilibrium proof'})

def rejected(call):
    try:
        call()
    except ValueError:
        return True
    return False

new = refill(100,0,0,60,100,100)
old = legacy_refill(100,0,0,100,100)
record('v5_priority_can_starve_normal_renewal',
       {'v5_working':old['working_after'], 'v6_working':new['working_after'],
        'v6_protected':new['protected_after'], 'renewal_cost':60},
       {'v5_working':0, 'v6_working':60, 'v6_protected':40, 'renewal_cost':60})
record('insufficient_consumption_does_not_fabricate_floor', refill(20,0,0,60,100,100),
       {'floor':20,'protected':0,'working_extra':0,'burn':0,'working_after':20,'protected_after':0})
record('all_targets_met_burns_only_new_surplus', refill(100,100,100,60,100,100),
       {'floor':0,'protected':0,'working_extra':0,'burn':100,'working_after':100,'protected_after':100})
record('refill_reserve_then_working_above_floor', refill(100,80,50,60,100,100),
       {'floor':0,'protected':50,'working_extra':20,'burn':30,'working_after':100,'protected_after':100})
record('zero_usage_creates_no_credit', refill(0,20,10,60,100,100),
       {'floor':0,'protected':0,'working_extra':0,'burn':0,'working_after':20,'protected_after':10})
record('lower_targets_do_not_confiscate_old_balances', refill(10,120,130,60,100,100),
       {'floor':0,'protected':0,'working_extra':0,'burn':10,'working_after':120,'protected_after':130})
held_working = 100
free_refill = refill(20,0,0,60,100,100)
record('existing_holds_are_not_free_renewal_funds',
       {'free_working_after':free_refill['working_after'],'held_unchanged':held_working},
       {'free_working_after':20,'held_unchanged':100})
record('expansion_cannot_consume_floor', expansion(70,100,60,100,20,True,True), False)
record('depleted_protected_target_blocks_new_expansion', expansion(100,50,60,100,20,True,True), False)
record('funded_justified_complete_expansion', expansion(100,100,60,100,20,True,True), True)
record('idle_budget_is_not_demand', expansion(100,100,60,100,20,False,True), False)
record('fragment_is_not_complete_route', expansion(100,100,60,100,20,True,False), False)
record('issuance_or_reserve_support_does_not_erase_recurring_deficit', recurring(90,100),
       {'numerator':9,'denominator':10,'deficit':10,'covers_normal_cost':False})
record('equal_recurring_flow_is_arithmetic_only', recurring(100,100),
       {'numerator':1,'denominator':1,'deficit':0,'covers_normal_cost':True})
cap = 1000 * POLICY['exposure']['issuance_reference_numerator'] // POLICY['exposure']['issuance_reference_denominator']
exposure = 200+100+20
headroom = max(0,cap-exposure)
record('bootstrap_allocation_still_requires_headroom',
       {'headroom':headroom,'requested':40,'permitted':40 <= headroom},
       {'headroom':30,'requested':40,'permitted':False})
record('negative_quantity_rejected', rejected(lambda:refill(-1,0,0,60,100,100)), True)
record('working_floor_above_target_rejected', rejected(lambda:refill(1,0,0,120,100,100)), True)
record('out_of_range_stored_integer_rejected', rejected(lambda:refill(MAXIMUM+1,0,0,60,100,100)), True)
record('empty_workload_does_not_prove_equilibrium', rejected(lambda:recurring(0,0)), True)

report = {
    'status':'passed_bounded_reference_checks',
    'policy_version':POLICY['policy_version'],
    'policy_sha256':hashlib.sha256(POLICY_PATH.read_bytes()).hexdigest(),
    'checker_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    'case_count':len(cases),'cases':cases,
    'integrated_economic_simulation_executed':False,
    'hardware_or_payment_execution':False,'public_launch_approved':False,
    'conclusion':'priority counterexample corrected in the reference; recurring viability and deployed behavior remain unvalidated'
}
(HERE / 'v6-policy-reference-checks.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'status':report['status'],'cases':len(cases),'scope':report['conclusion']},ensure_ascii=False))

