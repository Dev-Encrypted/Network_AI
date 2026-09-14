"""Cooperative economy and elastic admission reference, with fictional inputs.

No product, GPU, payment, identity, consensus or database is implemented here.
"""
import hashlib
import json
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path

BASE = Path(__file__).resolve().parent
SOURCE = BASE / "cooperative-elastic-policy.json"
P = json.loads(SOURCE.read_text(encoding="utf-8"))
U = P["microtu_per_tu"]
CASES = []


def record(key, name, inputs, outputs, condition, limitation):
    if not condition:
        raise AssertionError(key + ": " + name)
    CASES.append({"id": key, "name": name, "inputs": inputs, "outputs": outputs,
                  "status": "passed_reference", "limitation": limitation})


def stock_room(reference, available_and_held, promised, approved_refunds=0):
    target = reference * P["service_stock_target_bps"] // 10000
    return max(0, target - available_and_held - promised - approved_refunds)


def quota(capacity, paid_reserved, active_accounts):
    if not active_accounts or capacity <= paid_reserved:
        return Fraction(0)
    return Fraction(capacity - paid_reserved, active_accounts)


@dataclass
class Elastic:
    level: int = 1
    stable: int = 0

    def tick(self, regular_pressure_bps, resource_pressure_bps=3000,
             queue_wait_seconds=0, valid=True):
        spec = P["elastic"]
        if not valid:
            self.level, self.stable = 0, 0
            return self.level
        if self.level == 0:
            self.level = 1
        if (queue_wait_seconds > 0
                or regular_pressure_bps >= spec["regular_pressure_for_two_bps"]
                or resource_pressure_bps >= spec["resource_pressure_blocks_extras_bps"]):
            self.level, self.stable = 1, 0
            return self.level
        target = 4 if regular_pressure_bps < spec["regular_pressure_for_four_bps"] else 2
        if self.level > target:
            self.level, self.stable = target, 0
        if self.level == target:
            self.stable = 0
            return self.level
        self.stable += spec["evaluation_seconds"]
        if self.stable >= spec["stable_seconds_per_promotion"]:
            self.level = 2 if self.level == 1 else 4
            self.stable = 0
        return self.level


earned = 600000 * 1000 // 1000
record("A01", "Useful cooperative readiness earns without paid buyers",
       {"paid_buyers": 0, "verified_ms": 600000, "rate_microtu_per_second": 1000},
       {"earned_microtu": earned, "financial_deposit_required": False},
       earned == 600000 and not P["cooperative_earnings_require_paid_buyers"],
       "Assumes an eligible accepted lease, verified duration and reserved issuance budget.")

q10, q2 = quota(40, 0, 10), quota(40, 0, 2)
record("A02", "Fewer participants can use a larger share of the same capacity",
       {"safe_equal_tasks_per_minute": 40, "active_accounts": [10, 2]},
       {"quota_with_ten": str(q10), "quota_with_two": str(q2), "increase_factor": str(q2/q10)},
       q10 == 4 and q2 == 20 and 10*q10 == 2*q2 == 40,
       "Equal-task allocation only; real scheduling needs per-model resource cost and slots.")

busy = Elastic(level=4)
busy.tick(9000, queue_wait_seconds=15)
record("A03", "Zero buyers does not imply idle cooperative capacity",
       {"paid_buyers": 0, "cooperative_pressure_bps": 9000, "queue_wait_seconds": 15},
       {"new_concurrency_ceiling": busy.level}, busy.level == 1,
       "Pressure and queue observations are supplied as inputs, not measured from GPUs.")

ramp = Elastic()
timeline = []
for second in range(30, 631, 30):
    timeline.append({"second": second, "ceiling": ramp.tick(1000)})
record("A04", "Promotion waits for stable windows and advances one level at a time",
       {"regular_pressure_bps": 1000, "stable_window_seconds": 300},
       {"timeline": timeline},
       timeline[8]["ceiling"] == 1 and timeline[9]["ceiling"] == 2
       and timeline[18]["ceiling"] == 2 and timeline[19]["ceiling"] == 4,
       "Reference hysteresis, not latency or scheduling throughput under real load.")

accepted_quote = ("session-fixture", 4*U, 60)
quote_before = tuple(accepted_quote)
ramp.tick(3000, queue_wait_seconds=1)
record("A05", "A new competing request stops new extras without changing accepted terms",
       {"accepted_cost_microtu": 4*U, "accepted_deadline_seconds": 60, "new_queue_wait_seconds": 1},
       {"new_ceiling": ramp.level, "accepted_terms_unchanged": accepted_quote == quote_before},
       ramp.level == 1 and accepted_quote == quote_before,
       "Immutable quote reference; real in-flight jobs, deadlines and recovery still require tests.")

jitter = Elastic()
jitter_levels = [jitter.tick(p) for p in ([2400, 5100] * 20)]
record("A06", "Brief low-pressure oscillations do not repeatedly promote limits",
       {"alternating_pressure_bps": [2400, 5100], "samples": 40},
       {"maximum_ceiling": max(jitter_levels), "ending_ceiling": jitter.level},
       max(jitter_levels) == 1,
       "Tests a specific oscillation trace, not stability under every workload.")

stale = Elastic(level=4)
stale.tick(0, valid=False)
memory = Elastic(level=4)
memory.tick(1000, resource_pressure_bps=9000)
record("A07", "Missing telemetry and resource saturation prevent extra admissions",
       {"stale_snapshot": True, "memory_pressure_bps": 9000},
       {"stale_ceiling": stale.level, "resource_pressure_ceiling": memory.level},
       stale.level == 0 and memory.level == 1,
       "Invalid proof blocks new sessions; actual resource guards and OOM prevention are not implemented.")

compact, giant = quota(40, 0, 2), quota(0, 0, 2)
record("A08", "Idle capacity for one model does not invent capacity for another",
       {"compact_safe_capacity": 40, "giant_safe_capacity": 0, "accounts_each": 2},
       {"compact_quota": str(compact), "giant_quota": str(giant)},
       compact == 20 and giant == 0,
       "Assumes fixed qualified profiles; model migration/resharding are separate operations.")

ceiling, physical_slots = 4, 2
actual = min(ceiling, physical_slots)
record("A09", "Elastic account limit remains bounded by qualified physical slots",
       {"account_ceiling": ceiling, "qualified_available_slots": physical_slots},
       {"maximum_admissible_concurrency": actual}, actual == 2,
       "Real admission must atomically reserve all memory, network and route resources.")

stock, commitments, pending_refunds = 1000*U, 200*U, 50*U
before = stock + commitments + pending_refunds
after = (stock + 100*U) + (commitments - 100*U) + pending_refunds
record("A10", "Issuing an already committed reward preserves total service exposure",
       {"stock_microtu": stock, "commitments_microtu": commitments, "pending_refund_microtu": pending_refunds},
       {"exposure_before_microtu": before, "exposure_after_microtu": after}, before == after == 1250*U,
       "Service accounting only, not funds backing or database concurrency proof.")

stock = 1000*U
daily = []
for day in range(1, 15):
    new_offer_budget = min(1000*U, stock_room(7000*U, stock, 0))
    stock += new_offer_budget
    daily.append({"day": day, "new_accepted_and_verified_microtu": new_offer_budget, "stock_microtu": stock})
record("A11", "No consumption cannot create unlimited banked promises",
       {"paid_buyers": 0, "cooperative_redemptions": 0, "days": 14, "initial_stock_tu": 1000, "reference_tu": 7000},
       {"days": daily, "final_stock_microtu": stock},
       stock == 2450*U and daily[0]["new_accepted_and_verified_microtu"] == 1000*U
       and daily[1]["new_accepted_and_verified_microtu"] == 450*U
       and all(row["new_accepted_and_verified_microtu"] == 0 for row in daily[2:]),
       "Every day is a new offered budget; accepted rates are not cut. Does not model contributor departure.")

stock = 1000*U
for _ in range(30):
    stock -= 200*U
    issue = min(200*U, stock_room(7000*U, stock, 0))
    stock += issue
record("A12", "Cooperative earning and use can circulate for 30 days with zero sales",
       {"paid_buyers": 0, "daily_cooperative_use_tu": 200, "daily_eligible_reward_tu": 200, "days": 30},
       {"ending_service_stock_tu": stock // U, "financial_revenue": 0}, stock == 1000*U,
       "Constant fictional supply/demand and covered issuance; does not prove electricity or infrastructure funding.")

before_drop = stock_room(7000*U, 2000*U, 0)
after_drop = stock_room(3500*U, 2000*U, 0)
record("A13", "Capacity loss restricts new promises without deleting earned TU",
       {"stock_tu": 2000, "reference_before_tu": 7000, "reference_after_tu": 3500},
       {"headroom_before_microtu": before_drop, "headroom_after_microtu": after_drop, "preserved_stock_tu": 2000},
       before_drop == 450*U and after_drop == 0,
       "Risk detection, not a guarantee that replacement nodes or immediate redemptions exist.")

contributions = 980*U
grants = contributions // 49
record("A14", "Cooperative onboarding grants do not require commercial revenue",
       {"verified_cooperative_issuance_tu": 980, "sales": 0},
       {"grant_limit_microtu": grants, "share_of_total": str(Fraction(grants, contributions+grants))},
       grants == 20*U and Fraction(grants, contributions+grants) == Fraction(1,50),
       "Stock, campaign, identity and epoch controls must also permit the grant.")

safe = 100
commercial_cap = safe * P["reference_pool_commercial_capacity_cap_bps"] // 10000
record("A15", "Uncommitted commercial capacity is available to cooperation",
       {"safe_capacity": safe, "commercial_cap": commercial_cap, "confirmed_commercial_reservation": 0},
       {"cooperative_capacity_without_sales": safe, "cooperative_capacity_at_commercial_cap": safe-commercial_cap},
       commercial_cap == 25 and safe-commercial_cap == 75,
       "Local mixed-pool policy; safe capacity must already discount overhead and contingency.")

commercial_request = 30
record("A16", "A funded buyer cannot override the cooperative capacity commitment",
       {"commercial_requested_capacity": commercial_request, "commercial_limit": commercial_cap, "buyer_has_funds": True},
       {"new_commercial_reservation_allowed": commercial_request <= commercial_cap},
       commercial_request > commercial_cap,
       "Other independent pools may advertise a different policy; existing accepted reservations remain binding.")

tu_balance, payment_balance = 100*U, 0
tu_balance += 30*U
record("A17", "Cooperative earnings do not create withdrawable payment balance",
       {"starting_tu": 100, "cooperative_earned_tu": 30, "starting_payment_atomic": 0},
       {"ending_tu": tu_balance//U, "ending_payment_atomic": payment_balance},
       tu_balance == 130*U and payment_balance == 0 and not P["cooperative_credit_cash_conversion"],
       "Two-ledger arithmetic; real wallet isolation and malicious cross-mode payloads require implementation tests.")

resource_claims = {("gpu-fixture", 0, 900): "cooperative"}
duplicate_key = ("gpu-fixture", 0, 900)
record("A18", "One reserved interval cannot also receive full spot remuneration",
       {"existing_mode": resource_claims[duplicate_key], "requested_mode": "commercial"},
       {"second_full_allocation_allowed": duplicate_key not in resource_claims},
       duplicate_key in resource_claims,
       "Exact duplicate interval reference; real overlap, fractional resources and fake physical identities need tests.")

record("A19", "An elastic quota is not saved and does not change model context",
       {"previous_ceiling": 4, "new_ceiling": 1, "qualified_context_tokens": 8192},
       {"banked_extra_quota": 0, "context_tokens": 8192},
       not P["elastic"]["quota_is_bankable"] and not P["elastic"]["context_limit_changes_automatically"],
       "Contract definition, not a benchmark of memory or context limits.")

request_mode, tu_available, money_available = "cooperative", 0, 100
can_bill = tu_available > 0
record("A20", "Insufficient TU cannot silently spend the payment wallet",
       {"billing_mode": request_mode, "available_tu": tu_available, "available_payment_units": money_available},
       {"cooperative_request_admitted": can_bill, "payment_units_after": money_available},
       not can_bill and not P["automatic_billing_mode_fallback"],
       "Mode-selection reference; secure API authorization and exact price comparison still need tests.")

report = {"policy_version": P["policy_version"], "status": "passed_reference",
          "scope": "20 deterministic arithmetic/control examples with fictional inputs, not a production simulation",
          "case_count": len(CASES), "cases": CASES,
          "policy_sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
          "simulator_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
target = BASE / "cooperative-elastic-simulations.json"
target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"status": report["status"], "case_count": len(CASES), "output": str(target)}))
