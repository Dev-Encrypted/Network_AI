"""Deterministic arithmetic reference for the planning documents, not a service.

Uses fictional inputs. Does not test real GPU capacity, identity, latency, user
behavior, legal solvency or production ledger concurrency. No network or packages.
"""

import hashlib
import json
from fractions import Fraction
from pathlib import Path


HERE = Path(__file__).resolve().parent
POLICY_PATH = HERE / "token-economy-policy.json"
POLICY = json.loads(POLICY_PATH.read_text(encoding="utf-8"))
MICRO = POLICY["micro_units_per_unit"]
BPS = 10_000
CASES = []


def tu(n):
    return n * MICRO


def shown(n):
    return f"{n // MICRO}.{n % MICRO:06d}"


def ceil_div(n, d):
    return (n + d - 1) // d


def cost(profile, uncached, cached, output):
    rates = POLICY["fictional_model_tariffs"]["profiles"][profile]
    return ceil_div(
        uncached * rates["input_microtu"]
        + cached * rates["cached_microtu"]
        + output * rates["output_microtu"],
        POLICY["fictional_model_tariffs"]["denominator_processed_tokens"],
    )


def headroom(capacity, stock, commitments, refunds=0, sales=0):
    target = capacity * POLICY["coverage"]["target_bps"] // BPS
    return max(0, target - stock - commitments - refunds - sales)


def category(capacity, exposure):
    if capacity == 0:
        return "no_capacity" if exposure else "no_obligations_no_capacity"
    ratio = Fraction(exposure * BPS, capacity)
    if ratio > POLICY["coverage"]["critical_bps"]:
        return "critical"
    if ratio > POLICY["coverage"]["warning_bps"]:
        return "warning"
    if ratio > POLICY["coverage"]["target_bps"]:
        return "above_target"
    return "within_target"


def record(case_id, name, inputs, outputs, condition, limitation):
    if not condition:
        raise AssertionError(f"Planning arithmetic failed: {case_id} {name}")
    CASES.append({"id": case_id, "name": name, "inputs": inputs,
                  "outputs": outputs, "status": "passed_arithmetic",
                  "limitation": limitation})


prices = {p: cost(p, 2000, 0, 500) for p in ("compact", "medium", "giant")}
record("T01", "Different models consume the same balance at different rates",
       {"uncached_input": 2000, "output": 500},
       {p + "_tu": shown(v) for p, v in prices.items()},
       list(prices.values()) == [tu(4), tu(16), tu(80)],
       "Fictional rates; no claim about real model cost or quality.")

holds = {p: cost(p, 2000, 0, 1000) for p in prices}
releases = {p: holds[p] - prices[p] for p in prices}
record("T02", "Maximum authorization and release of unused balance",
       {"max_output": 1000, "actual_output": 500},
       {"holds_tu": {p: shown(v) for p, v in holds.items()},
        "releases_tu": {p: shown(v) for p, v in releases.items()}},
       list(holds.values()) == [tu(6), tu(24), tu(120)]
       and list(releases.values()) == [tu(2), tu(8), tu(40)],
       "Does not exercise gateway metering or concurrent wallet writes.")

cached = cost("compact", 1500, 500, 500)
record("T03", "Verified cache discount remains within the original hold",
       {"total_input": 2000, "confirmed_cached_input": 500, "output": 500},
       {"cost_tu": shown(cached), "hold_tu": shown(holds["compact"])},
       cached == 3_625_000 and cached <= holds["compact"],
       "A real deployment needs independent evidence of the cache hit.")

fragments_ms = [1] * 1000
rate_microtu_per_second = 1501
carried = sum(fragments_ms) * rate_microtu_per_second // 1000
naive = sum(ms * rate_microtu_per_second // 1000 for ms in fragments_ms)
record("T04", "Accumulated remainder prevents receipt fragmentation losses",
       {"fragments_ms": 1, "fragment_count": 1000, "rate_microtu_per_second": 1501},
       {"carried_microtu": carried, "single_receipt_microtu": 1501,
        "incorrect_independent_rounding_microtu": naive},
       carried == 1501 and naive == 1000,
       "Only rounding arithmetic; receipt authenticity is outside the simulation.")

budget = tu(420)
weights = [1, 2, 4]
payouts = [budget * w // sum(weights) for w in weights]
split_weights = [1, 2, 2, 2]
split_payouts = [budget * w // sum(split_weights) for w in split_weights]
record("T05", "Splitting a fixed verified resource weight creates no reward",
       {"fixed_route_budget_tu": "420", "weights": weights,
        "same_total_weight_after_split": split_weights},
       {"payouts_tu": [shown(v) for v in payouts],
        "split_combined_tu": shown(sum(split_payouts[-2:]))},
       sum(payouts) == budget and sum(split_payouts) == budget
       and payouts[-1] == sum(split_payouts[-2:]),
       "Assumes total verified weight is preserved; it does not detect fake identities.")

capacity, stock, commitments, pending_refunds = tu(1000), tu(200), tu(50), tu(10)
room = headroom(capacity, stock, commitments, pending_refunds)
epoch_room, group_room = tu(70), tu(100)
allowed = min(room, epoch_room, group_room)
record("T06", "Exposure, epoch and group limits all constrain a new lease",
       {"capacity_ref_tu": "1000", "stock_tu": "200", "commitments_tu": "50",
        "pending_refunds_tu": "10", "epoch_room_tu": "70", "group_room_tu": "100"},
       {"stock_room_tu": shown(room), "maximum_new_commitment_tu": shown(allowed)},
       room == tu(90) and allowed == tu(70),
       "Capacity input is fictional; its conservative measurement remains a field requirement.")

first = min(tu(60), room)
second_room = headroom(capacity, stock, commitments + first, pending_refunds)
record("T07", "An accepted commitment removes headroom before issuance",
       {"initial_headroom_tu": shown(room), "two_requested_leases_tu": ["60", "60"]},
       {"first_accepted_tu": shown(first), "second_maximum_tu": shown(second_room)},
       second_room == tu(30) and first + second_room == room,
       "Sequential reference; database locking and race prevention still need implementation tests.")

before = stock + commitments + pending_refunds
after_issue = (stock + tu(20)) + (commitments - tu(20)) + pending_refunds
available, held = stock - tu(40), tu(40)
after_refund = stock + pending_refunds + commitments
record("T08", "Issuance, consumer holds and posting a refund do not hide exposure",
       {"exposure_tu": shown(before), "issuance_tu": "20", "consumer_hold_tu": "40"},
       {"after_issuance_exposure_tu": shown(after_issue),
        "stock_after_hold_tu": shown(available + held),
        "after_refund_posting_exposure_tu": shown(after_refund)},
       before == after_issue == after_refund and available + held == stock,
       "Operational claims accounting; not a financial accounting opinion.")

initial = tu(300)
redemption = tu(20)
uncontrolled_daily = tu(100)
adaptive_daily = redemption * POLICY["issuance"]["daily_net_redemptions_multiplier_bps"] // BPS
fixed_end = initial + 7 * (uncontrolled_daily - redemption)
adaptive_end = initial + 7 * (adaptive_daily - redemption)
record("T09", "Low demand makes fixed issuance grow stock while a capped flow declines",
       {"days": 7, "initial_stock_tu": "300", "net_redemption_per_day_tu": "20",
        "uncontrolled_issuance_per_day_tu": "100", "growth_budget_tu": "0"},
       {"uncontrolled_end_tu": shown(fixed_end), "capped_daily_issuance_tu": shown(adaptive_daily),
        "capped_end_tu": shown(adaptive_end)},
       fixed_end == tu(860) and adaptive_daily == tu(19) and adaptive_end == tu(293),
       "Constant hypothetical capacity and demand; does not model contributor departure or recovery.")

contract_rate, seconds = 1000, 900
reserved = contract_rate * seconds
earned_half = contract_rate * 450
record("T10", "Demand drop cannot retroactively reduce an accepted lease rate",
       {"rate_microtu_per_second": contract_rate, "maximum_seconds": seconds,
        "verified_seconds": 450},
       {"initial_commitment_microtu": reserved, "earned_microtu": earned_half,
        "still_committed_microtu": reserved - earned_half},
       reserved == earned_half + (reserved - earned_half) and reserved == 900000,
       "Assumes valid verified intervals and that the accepted contract is honored.")

exposure = tu(300)
states = {str(c): category(tu(c), exposure) for c in (1000, 500, 300, 0)}
record("T11", "Capacity contraction triggers risk even without new issuance",
       {"exposure_tu": "300", "capacity_ref_tu": ["1000", "500", "300", "0"]},
       {"categories": states, "room_after_50_percent_drop_tu": shown(headroom(tu(500), exposure, 0))},
       states == {"1000": "within_target", "500": "warning", "300": "critical", "0": "no_capacity"},
       "Detection only; replacement GPUs and cash-funded continuity are not simulated.")

public_price_before, public_price_after = 100, 110
fixed_reference_capacity = tu(1000)
record("T12", "A public tariff increase does not manufacture reference capacity",
       {"public_tariff_index_before": public_price_before, "public_tariff_index_after": public_price_after},
       {"capacity_ref_before_tu": shown(fixed_reference_capacity),
        "capacity_ref_after_tu": shown(fixed_reference_capacity),
        "incorrect_repriced_capacity_tu": shown(fixed_reference_capacity * 110 // 100)},
       headroom(fixed_reference_capacity, tu(300), 0) == tu(50),
       "A basket change still needs a reconciled policy decision; price alone does not add hardware.")

compact_capacity, giant_capacity = 90, 10
giant_requests = 50
served_giant = min(giant_capacity, giant_requests)
record("T13", "Aggregate capacity cannot satisfy arbitrary model concentration",
       {"compact_jobs_per_window": compact_capacity, "giant_jobs_per_window": giant_capacity,
        "requests_for_giant": giant_requests},
       {"served_giant": served_giant, "queued_or_unavailable_giant": giant_requests - served_giant,
        "unused_compact_capacity": compact_capacity},
       served_giant == 10 and giant_requests - served_giant == 40,
       "Jobs use fixed illustrative sizes; no automatic conversion of compact GPU capacity is assumed.")

total_capacity = 100
cooperative, paid = 60, 20
over_cooperative = 90
record("T14", "Paid traffic and token redemption share one physical capacity constraint",
       {"net_capacity": total_capacity, "cooperative_allocation": cooperative, "paid_allocation": paid},
       {"uncommitted_capacity": total_capacity - cooperative - paid,
        "overloaded_example": over_cooperative + paid,
        "overloaded_admission_allowed": over_cooperative + paid <= total_capacity},
       cooperative + paid <= total_capacity and over_cooperative + paid > total_capacity,
       "Capacity feasibility only; does not prove monetary profit or fulfillment of future TU claims.")

contributor_emission = tu(980)
grant_bps = POLICY["issuance"]["grants_max_share_of_realized_issuance_bps"]
grant_limit = contributor_emission * grant_bps // (BPS - grant_bps)
record("T15", "Grant share is capped against realized issuance, not an unused budget",
       {"verified_contributor_emission_tu": "980", "grant_share_bps": grant_bps},
       {"maximum_grant_tu": shown(grant_limit),
        "realized_total_tu": shown(contributor_emission + grant_limit),
        "grant_limit_without_contribution_microtu": 0},
       grant_limit == tu(20)
       and grant_limit * BPS <= grant_bps * (contributor_emission + grant_limit),
       "Campaign, identity, stock and epoch limits must also permit the grant.")

earned = tu(30)
self_call_cost = tu(4)
record("T16", "Self-calls do not increase issuance when work bonuses are disabled",
       {"contracted_verified_earnings_tu": "30", "self_call_cost_tu": "4", "work_bonus_enabled": False},
       {"net_without_call_tu": shown(earned), "net_with_call_tu": shown(earned - self_call_cost),
        "additional_issuance_microtu": 0},
       earned - self_call_cost < earned and POLICY["issuance"]["work_bonus_enabled"] is False,
       "Does not prove resistance to manipulated forecasts, hidden related parties or collusion.")

starting_wallet = 600000
held = 400000
consumed = 250000
released = held - consumed
available_after = starting_wallet - held + released
refund = 50000
record("T17", "Partial settlement and refund preserve the original ledger example in TU",
       {"earned_microtu": starting_wallet, "hold_microtu": held, "consumed_microtu": consumed, "refund_microtu": refund},
       {"available_after_settlement_microtu": available_after,
        "available_after_refund_microtu": available_after + refund,
        "net_consumption_microtu": consumed - refund},
       available_after == 350000 and available_after + refund == 400000
       and available_after + refund + consumed - refund == starting_wallet,
       "Arithmetic only; database idempotency and fault injection are specified in the product backlog.")

# With one non-preemptive slot and equal work, alternating eligible tenants
# gives the same starts regardless of wallet magnitude, once both can afford it.
wallets = {"A": tu(10000), "B": tu(100)}
price = tu(4)
order = ["A", "B"] * 5
starts = {k: [] for k in wallets}
for slot, account in enumerate(order):
    if wallets[account] < price:
        raise AssertionError("Both accounts must remain eligible in this example")
    wallets[account] -= price
    starts[account].append(slot)
record("T18", "Account rotation does not give extra slots to a larger wallet",
       {"initial_wallets_tu": {"A": "10000", "B": "100"}, "equal_price_tu": "4", "slots": 10},
       {"starts_by_account": starts, "completed_jobs": {k: len(v) for k, v in starts.items()}},
       len(starts["A"]) == len(starts["B"]) == 5,
       "Only an equal-job rotation example, not DRF, heterogeneous-job fairness or Sybil resistance.")

REPORT = {
    "schema_version": 1,
    "policy_version": POLICY["policy_version"],
    "scope": "deterministic arithmetic examples with fictional inputs; no empirical infrastructure validation",
    "policy_sha256": hashlib.sha256(POLICY_PATH.read_bytes()).hexdigest(),
    "simulator_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    "numeric_money_representation": "integer microTU; displayed TU strings",
    "case_count": len(CASES),
    "status": "passed_arithmetic",
    "cases": CASES,
}
target = HERE / "token-economy-simulations.json"
target.write_text(json.dumps(REPORT, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"status": REPORT["status"], "case_count": len(CASES), "output": str(target)}))
