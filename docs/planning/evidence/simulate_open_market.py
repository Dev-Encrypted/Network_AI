"""Arithmetic reference for funded payments, not a contract or consensus test."""
import hashlib
import json
from fractions import Fraction
from pathlib import Path

BASE = Path(__file__).resolve().parent
POLICY_PATH = BASE / "open-market-policy.json"
POLICY = json.loads(POLICY_PATH.read_text(encoding="utf-8"))
U = POLICY["micro_units_per_unit"]
CASES = []


def record(case_id, name, inputs, outputs, valid, limitation):
    if not valid:
        raise AssertionError(case_id)
    CASES.append({"id": case_id, "name": name, "inputs": inputs,
                  "outputs": outputs, "status": "passed_arithmetic", "limitation": limitation})


shares = POLICY["fictional_spot_split_bps"]
payment = 100 * U
alloc = {k: payment * bps // 10000 for k, bps in shares.items()}
record("M01", "Payment redistribution conserves funded value",
       {"payment_payment_atomic": payment, "split_bps": shares}, {"allocations_payment_atomic": alloc},
       sum(shares.values()) == 10000 and sum(alloc.values()) == payment,
       "No real transfer, external asset or distributed ledger was executed. Cooperative TU issuance is a separate policy.")

pool_before, reward = 100 * U, 30 * U
record("M02", "READY reward transfers from an already funded pool",
       {"funded_pool_payment_atomic": pool_before, "verified_reward_payment_atomic": reward},
       {"pool_after_payment_atomic": pool_before - reward, "provider_after_payment_atomic": reward,
        "additional_unbacked_value_payment_atomic": 0},
       pool_before - reward + reward == pool_before,
       "Readiness and funding confirmation are assumed, not demonstrated by this arithmetic.")

funds, first_lease, next_lease = 100 * U, 70 * U, 40 * U
free = funds - first_lease
record("M03", "Two commitments cannot spend the same pool funds",
       {"funds_payment_atomic": funds, "first_commitment_payment_atomic": first_lease, "second_requested_payment_atomic": next_lease},
       {"remaining_payment_atomic": free, "second_allowed": next_lease <= free},
       free == 30 * U and next_lease > free,
       "Sequential constraint only; cross-operator double spending needs qualified settlement.")

fees = 6 * U
grant = fees * POLICY["reference_pool_grant_share_of_available_fee_revenue_bps"] // 10000
record("M04", "A grant is funded from available fees instead of new issuance",
       {"available_fee_revenue_payment_atomic": fees, "grant_share_bps": 200},
       {"grant_payment_atomic": grant, "fees_remaining_payment_atomic": fees - grant},
       grant == 120000 and grant + (fees - grant) == fees,
       "Illustrative local pool rule, not a mandatory worldwide free allocation.")

wallet, hold, used = 200 * U, 120 * U, 80 * U
split_used = {k: used * bps // 10000 for k, bps in shares.items()}
final_wallet = wallet - hold + (hold - used)
record("M05", "Unused hold releases while service payments remain funded",
       {"initial_wallet_payment_atomic": wallet, "hold_payment_atomic": hold, "actual_cost_payment_atomic": used},
       {"release_payment_atomic": hold - used, "final_wallet_payment_atomic": final_wallet,
        "recipients_payment_atomic": split_used},
       final_wallet == 120 * U and sum(split_used.values()) == 80 * U
       and final_wallet + sum(split_used.values()) == wallet,
       "Does not demonstrate metering authenticity, refund disputes or transaction races.")

deposit, reserved, wanted = 100 * U, 60 * U, 50 * U
withdrawable = deposit - reserved
record("M06", "Withdrawal cannot reuse funds already held for service",
       {"funded_value_payment_atomic": deposit, "held_payment_atomic": reserved, "withdraw_requested_payment_atomic": wanted},
       {"withdrawable_payment_atomic": withdrawable, "request_allowed": wanted <= withdrawable,
        "backing_after_maximum_withdrawal_payment_atomic": deposit - withdrawable},
       wanted > withdrawable and deposit - withdrawable == reserved,
       "Unilateral withdrawal, finality and escrow behavior still need real contract tests.")

cost = Fraction(2, 5)
fee_fraction, margin = Fraction(1, 10), Fraction(1, 5)
minimum = cost / (1 - fee_fraction - margin)
offered = Fraction(1, 2)
profit_at_offer = offered * (1 - fee_fraction) - cost
realized_margin = profit_at_offer / offered
record("M07", "An apparently cheap price may miss the provider margin target",
       {"cost": "0.40", "fee_fraction": "0.10", "target_margin": "0.20", "buyer_price": "0.50"},
       {"minimum_price_exact": str(minimum), "minimum_price_approx": "0.571429",
        "margin_at_buyer_price_exact": str(realized_margin)},
       minimum == Fraction(4, 7) and realized_margin == Fraction(1, 10) < margin,
       "Fictional inputs, no quotation of energy, GPU rental or third-party API prices.")

initial_deposit = 0
published_nodes, published_models = 1000, 5000
funded_earnings = 0
record("M08", "Publishing alone does not manufacture financial revenue",
       {"created_nodes": published_nodes, "published_models": published_models,
        "funded_counterparty_payment_atomic": initial_deposit},
       {"new_spendable_payment_atomic": funded_earnings},
       funded_earnings == 0 and POLICY["gain_requires_funded_counterparty"],
       "An accounting policy; it does not prove Sybil, spam or malicious model defenses.")

report = {
    "policy_version": POLICY["policy_version"],
    "scope": "deterministic funded-market arithmetic with fictional inputs; not distributed-system validation",
    "policy_sha256": hashlib.sha256(POLICY_PATH.read_bytes()).hexdigest(),
    "simulator_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    "status": "passed_arithmetic", "case_count": len(CASES), "cases": CASES,
}
target = BASE / "open-market-simulations.json"
target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"status": report["status"], "case_count": len(CASES), "path": str(target)}))
