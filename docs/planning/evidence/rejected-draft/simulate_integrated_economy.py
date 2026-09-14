"""Seeded economic model, not an inference service, ledger implementation or consensus test.

Hourly steps aggregate economic activity. Desired-work backlog is NOT an accepted
API queue; its age is NOT API latency. Every price, capacity and behavior is fictional.
"""
from collections import Counter, defaultdict, deque
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
import copy
import json
import math
import random

BASE = Path(__file__).resolve().parent
POLICY_PATH = BASE / "integrated-economy-policy.json"
P = json.loads(POLICY_PATH.read_text(encoding="utf-8"))
F = P["fictional_simulation"]
U = P["microtu_per_tu"]


def draw(seed, kind, *parts):
    payload = "|".join(map(str, (seed, kind) + parts)).encode()
    return int.from_bytes(sha256(payload).digest()[:8], "big") / 2**64


class Ledger:
    def __init__(self, balances):
        self.balances = dict(balances)
        self.initial = sum(balances.values())
        self.issued = self.burned = self.refunded = self.committed = 0
        self.seen = set()
        self.moves = 0

    def stock(self):
        return sum(self.balances.values())

    def audit(self):
        assert min(self.balances.values(), default=0) >= 0
        assert self.committed >= 0
        assert self.stock() == self.initial + self.issued + self.refunded - self.burned

    def unique(self, key):
        if key in self.seen:
            return False
        self.seen.add(key)
        self.moves += 1
        return True

    def transfer(self, key, source, target, amount):
        assert amount >= 0
        if not self.unique(key):
            return False
        assert self.balances.get(source, 0) >= amount
        self.balances[source] -= amount
        self.balances[target] = self.balances.get(target, 0) + amount
        self.audit()
        return True

    def promise(self, amount, ceiling):
        assert amount >= 0 and self.stock() + self.committed + amount <= ceiling
        self.committed += amount

    def issue(self, key, recipient, amount):
        if not self.unique(key):
            return False
        assert 0 <= amount <= self.committed
        self.committed -= amount
        self.issued += amount
        self.balances[recipient] = self.balances.get(recipient, 0) + amount
        self.audit()
        return True

    def consume(self, key, account, amount):
        if not self.unique(key):
            return False
        assert self.balances[account] >= amount >= 0
        self.balances[account] -= amount
        self.burned += amount
        self.audit()
        return True


def largest_remainder(amount, weights):
    total = sum(weights.values())
    pieces = {k: amount * v // total for k, v in weights.items()}
    remainder = amount - sum(pieces.values())
    rank = sorted(weights, key=lambda k: (-(amount * weights[k] % total), k))
    for key in rank[:remainder]:
        pieces[key] += 1
    assert sum(pieces.values()) == amount
    return pieces


@dataclass
class Provider:
    id: int
    kind: str
    base_rate: int
    absent_until: int = 0
    reward_ewma: float = 1.0


@dataclass
class Desire:
    id: str
    owner: int
    model: str
    work: int
    created: int
    failed_once: bool = False


SCENARIOS = {
    "steady_zero_buyers": {},
    "idle_then_return": {"quiet_start": 5, "quiet_end": 20, "quiet_multiplier": 0.05},
    "credit_overhang": {"stock_multiplier": 1.3},
    "large_model_rush": {"rush_start": 15, "rush_end": 25, "rush_share": 0.95},
    "correlated_exit": {"outage_start": 12, "outage_end": 15, "outage_fraction": 0.5},
    "all_inference_nodes_absent": {"outage_start": 12, "outage_end": 14, "outage_fraction": 1.0},
    "service_quorum_partition": {"partition_start": 10, "partition_end": 11},
    "mixed_commercial": {"commercial": True},
    "operating_funding_stops": {"donations_stop_day": 10},
    "undetected_experimental_fraud": {"fraud": True, "fraud_detection_probability": 0.0},
    "severe_combined_shock": {"stock_multiplier": 1.5, "outage_start": 12, "outage_end": 17,
                              "outage_fraction": 0.5, "rush_start": 10, "rush_end": 20,
                              "rush_share": 0.95, "fraud": True, "fraud_detection_probability": 0.0},
}


def within(day, spec, prefix):
    return spec.get(prefix + "_start", math.inf) <= day < spec.get(prefix + "_end", -math.inf)


def capacities(providers):
    small = sum(p.kind == "small" for p in providers)
    large = sum(p.kind == "large" for p in providers)
    roles = F["large_roles_per_complete_route"]
    groups, remainder = divmod(large, roles)
    return {"compact": small * F["small_work_units_per_hour"] + remainder * F["large_compact_work_units_per_hour"],
            "large": groups * F["large_route_work_units_per_hour"]}


def minimum_core(providers):
    small = sorted((p for p in providers if p.kind == "small"), key=lambda p: p.id)
    large = sorted((p for p in providers if p.kind == "large"), key=lambda p: p.id)
    n = F["large_roles_per_complete_route"]
    return ([small[0]] + large[:n]) if small and len(large) >= n else []


def simulate(name, seed, reserve_enabled=True, reserve_hours=None, retention_bps=None):
    spec = SCENARIOS[name]
    reserve_hours = P["continuity_hours"] if reserve_hours is None else reserve_hours
    retention_bps = F["default_retention_fraction_bps"] if retention_bps is None else retention_bps
    providers = [Provider(i, "small" if i < F["small_nodes"] else "large",
                          F["small_reward_microtu_per_hour"] if i < F["small_nodes"] else F["large_reward_microtu_per_hour"])
                 for i in range(F["small_nodes"] + F["large_nodes"])]
    accounts = len(providers) + F["non_provider_accounts"]
    initial_users = int(F["initial_users_microtu"] * spec.get("stock_multiplier", 1))
    assert F["initial_continuity_microtu"] <= F["historical_contributor_issuance_microtu"] // P["continuity_issuance_divisor"]
    warmup_burn = F["historical_contributor_issuance_microtu"] + F["initial_continuity_microtu"] - initial_users - F["initial_continuity_microtu"]
    assert warmup_burn >= 0
    parts = largest_remainder(initial_users, {i: 1 for i in range(accounts)})
    tu = Ledger({**parts, "continuity": F["initial_continuity_microtu"], "attacker": 0, "usage_hold": 0, "reserve_hold": 0})
    money = Ledger({"buyer": 1000000 if spec.get("commercial") else 0,
                    "providers": 0, "gateway": 0, "operations": 0, "reserve": 0, "hold": 0})
    price = {"compact": F["compact_price_microtu_per_work"], "large": F["large_price_microtu_per_work"]}
    desired = {"compact": defaultdict(deque), "large": defaultdict(deque)}
    deficits = defaultdict(int)
    cursors = {"compact": 0, "large": 0}
    metrics = Counter()
    states = Counter()
    delays = []
    daily = []
    operating_cash = F["initial_operating_cash_units"]
    operating_initial = operating_cash
    operating_donations = operating_spent = 0
    recovery_stable = 0
    in_defense = False
    access_demand = [0.0] * accounts
    access_delivered = [0.0] * accounts
    totals = Counter()
    coverage_min = math.inf
    allocation_checks = 0
    for hour in range(F["days"] * 24):
        day = hour // 24
        if hour % 24 == 0:
            if day < spec.get("donations_stop_day", math.inf):
                added = F["voluntary_cash_contribution_units_per_day"]
                operating_cash += added
                operating_donations += added
            if operating_cash > P["shutdown_reserve_days"] * F["core_cash_cost_units_per_day"]:
                operating_cash -= F["core_cash_cost_units_per_day"]
                operating_spent += F["core_cash_cost_units_per_day"]
        assert operating_cash == operating_initial + operating_donations - operating_spent >= 0
        cash_allows_service = operating_cash > P["shutdown_reserve_days"] * F["core_cash_cost_units_per_day"]
        quorum = not within(day, spec, "partition")
        # Draws are keyed; the same external event stream is reused by every policy variant.
        online = []
        for provider in providers:
            forced_absent = (within(day, spec, "outage")
                             and draw(seed, "outage", provider.id) < spec.get("outage_fraction", 0))
            if provider.absent_until <= hour and not forced_absent:
                online.append(provider)
        potential = capacities(online)
        wants_commercial = bool(spec.get("commercial")) and 8 <= hour % 24 < 20
        coop_fraction = 10000 - (P["commercial_capacity_cap_bps"] if wants_commercial else 0)
        potential_cooperative = {m: potential[m] - potential[m] * (10000-coop_fraction) // 10000 for m in price}
        cref = (sum(potential_cooperative[m] * price[m] for m in price) * P["capacity_horizon_hours"]
                * P["capacity_confidence_bps"] // 10000)
        ceiling = cref * P["stock_target_bps"] // 10000
        room = max(0, ceiling - tu.stock() - tu.committed)
        core = minimum_core(online)
        core_rate = sum(p.base_rate for p in core)
        target_reserve = core_rate * reserve_hours
        requested_rewards = {p.id: p.base_rate * coop_fraction // 10000 for p in online}
        reward_total = sum(requested_rewards.values())
        topup = min(max(0, target_reserve - tu.balances["continuity"]),
                    reward_total // P["continuity_issuance_divisor"])
        minimum_promise = core_rate + core_rate // P["continuity_issuance_divisor"]
        if not core or room < minimum_promise:
            in_defense = True
            recovery_stable = 0
        elif in_defense:
            recovery_stable += 1
            if recovery_stable >= P["recovery_stable_hours"]:
                in_defense = False
                recovery_stable = 0
        paid = Counter()
        active = []
        if not quorum:
            state = "QUORUM_BLOCKED"
        elif not cash_allows_service:
            state = "HIBERNATING_CASH"
        elif not core:
            state = "HIBERNATING_CAPACITY"
        elif not in_defense:
            state = "NORMAL"
            # Contract a complete minimum route first, then expand only within budget.
            selected_reward = 0
            for provider in core + [p for p in online if p not in core]:
                candidate_reward = selected_reward + requested_rewards[provider.id]
                candidate_topup = min(max(0, target_reserve-tu.balances["continuity"]),
                                      candidate_reward // P["continuity_issuance_divisor"])
                if candidate_reward + candidate_topup <= room:
                    active.append(provider)
                    selected_reward = candidate_reward
            assert all(p in active for p in core)
            reward_total = selected_reward
            topup = min(max(0, target_reserve-tu.balances["continuity"]),
                        reward_total // P["continuity_issuance_divisor"])
            tu.promise(reward_total + topup, ceiling)
            for provider in active:
                amount = requested_rewards[provider.id]
                tu.issue(("ordinary", hour, provider.id), provider.id, amount)
                paid[provider.id] += amount
                metrics["ordinary_rewards_microtu"] += amount
            tu.issue(("reserve_topup", hour), "continuity", topup)
            metrics["reserve_topups_microtu"] += topup
        else:
            in_defense = True
            if reserve_enabled and tu.balances["continuity"] >= core_rate:
                state = "RECOVERY" if recovery_stable else "DEFENSE"
                active = core
                wants_commercial = False
                coop_fraction = 10000
                before = tu.stock()
                tu.transfer(("reserve_hold", hour), "continuity", "reserve_hold", core_rate)
                for provider in core:
                    tu.transfer(("continuity_pay", hour, provider.id), "reserve_hold", provider.id, provider.base_rate)
                    paid[provider.id] += provider.base_rate
                    metrics["continuity_rewards_microtu"] += provider.base_rate
                assert before == tu.stock()
            else:
                state = "HIBERNATING_CREDITS"
        states[state] += 1
        if state in ("DEFENSE", "RECOVERY"):
            metrics["hours_with_minimum_service_supported_by_reserve"] += 1
        full_capacity = capacities(active)
        commercial_capacity = {m: full_capacity[m] * (10000-coop_fraction) // 10000 for m in price}
        service_capacity = {m: full_capacity[m] - commercial_capacity[m] for m in price}
        for m in price:
            assert commercial_capacity[m] * 10000 <= full_capacity[m] * P["commercial_capacity_cap_bps"]
            assert service_capacity[m] + commercial_capacity[m] <= full_capacity[m]
            allocation_checks += 1
            if service_capacity[m] == 0:
                metrics[m + "_unavailable_hours"] += 1
        coverage_min = min(coverage_min, len(active))
        # Desired work is generated even while supply is absent. It is never a held API request.
        for owner in range(accounts):
            access_demand[owner] *= 0.99
            access_delivered[owner] *= 0.99
            chance = F["desired_jobs_per_account_per_hour"]
            if within(day, spec, "quiet"):
                chance *= spec.get("quiet_multiplier", 1)
            if draw(seed, "arrival", hour, owner) >= chance:
                continue
            share = spec["rush_share"] if within(day, spec, "rush") else F["large_model_share"]
            model = "large" if draw(seed, "model", hour, owner) < share else "compact"
            sizes = F["request_sizes"]
            work = sizes[min(len(sizes)-1, int(draw(seed, "size", hour, owner) * len(sizes)))]
            request = Desire(f"{hour}:{owner}", owner, model, work, hour)
            desired[model][owner].append(request)
            metrics[model + "_desired_work"] += work
            access_demand[owner] += work * price[model] / U
        for model in price:
            for owner in list(desired[model]):
                queue = desired[model][owner]
                while queue and hour-queue[0].created >= F["unmet_demand_patience_hours"]:
                    metrics[model + "_abandoned_work"] += queue.popleft().work
            remaining = service_capacity[model]
            # Cost-based deficit round robin over known payer identities; not proof of Sybil resistance.
            for round_index in range(max(F["request_sizes"]) + 1):
                if not remaining:
                    break
                for offset in range(accounts):
                    owner = (cursors[model] + offset) % accounts
                    queue = desired[model][owner]
                    if not queue:
                        deficits[(model, owner)] = 0
                        continue
                    deficits[(model, owner)] = min(max(F["request_sizes"]) + 1, deficits[(model, owner)] + 1)
                    request = queue[0]
                    cost = request.work * price[model]
                    if request.work > remaining or request.work > deficits[(model, owner)]:
                        continue
                    if tu.balances[owner] < cost:
                        metrics["insufficient_tu_observations"] += 1
                        continue
                    queue.popleft()
                    deficits[(model, owner)] -= request.work
                    remaining -= request.work
                    metrics[model + "_executed_work"] += request.work
                    key = ("service", request.id, model)
                    assert tu.transfer((key, "hold"), owner, "usage_hold", cost)
                    if draw(seed, "failure", request.id, model) < F["failed_service_probability"]:
                        tu.transfer((key, "release"), "usage_hold", owner, cost)
                        metrics["failed_refunded_work"] += request.work
                    else:
                        tu.consume((key, "burn"), "usage_hold", cost)
                        metrics[model + "_served_work"] += request.work
                        metrics["served_cost_microtu"] += cost
                        access_delivered[owner] += cost / U
                        delays.append(hour - request.created)
                cursors[model] = (cursors[model] + 1) % accounts
            assert service_capacity[model] - remaining <= service_capacity[model]
            if wants_commercial:
                units = min(commercial_capacity[model], 1 + int(draw(seed, "paid", hour, model) * 3))
                amount = units * (1 if model == "compact" else 8)
                if money.balances["buyer"] >= amount > 0:
                    money.transfer(("hold", hour, model), "buyer", "hold", amount)
                    split = largest_remainder(amount, {"providers":90, "gateway":6, "operations":2, "reserve":2})
                    for who, value in split.items():
                        money.transfer(("pay", hour, model, who), "hold", who, value)
                    metrics["commercial_payment_units"] += amount
                    metrics["commercial_work"] += units
                assert units <= commercial_capacity[model]
        # Model an experimental verifier failure with ZERO detection as a sensitivity case.
        # Attackers never contribute physical capacity. The bound is admission scope, not a GPU proof.
        if spec.get("fraud") and quorum and state == "NORMAL":
            allowance = reward_total * P["experimental_issuance_cap_bps"] // 10000
            metrics["experimental_admission_ceiling_microtu"] += allowance
            if draw(seed, "detect", hour) >= spec["fraud_detection_probability"]:
                forged = min(allowance, max(0, ceiling-tu.stock()-tu.committed))
                tu.promise(forged, ceiling)
                tu.issue(("experimental_fraud", hour), "attacker", forged)
                metrics["undetected_fraud_microtu"] += forged
        for provider in providers:
            access_factor = (min(1.0, access_delivered[provider.id]/access_demand[provider.id])
                             if access_demand[provider.id] > 0 else 1.0)
            normalized_reward = paid[provider.id] / provider.base_rate * max(0.25, access_factor)
            provider.reward_ewma = 0.95 * provider.reward_ewma + 0.05 * normalized_reward
            if (hour > 0 and hour % F["economic_departure_check_hours"] == 0
                    and provider in online and provider.reward_ewma * 10000 < retention_bps
                    and draw(seed, "economic_departure", hour, provider.id) < 0.5):
                provider.absent_until = hour + 72
                metrics["economic_departures"] += 1
        tu.audit()
        money.audit()
        assert tu.committed == 0 and tu.balances["usage_hold"] == tu.balances["reserve_hold"] == 0
        assert money.stock() == money.initial
        assert metrics["undetected_fraud_microtu"] <= metrics["experimental_admission_ceiling_microtu"]
        if not spec.get("commercial"):
            assert money.stock() == 0
        if hour % 24 == 23:
            backlog = sum(request.work for queues in desired.values() for q in queues.values() for request in q)
            daily.append({"day":day+1, "state":state, "online_providers":len(online),
                          "contracted_providers":len(active), "stock_microtu":tu.stock(),
                          "reserve_microtu":tu.balances["continuity"], "reference_microtu":cref,
                          "operating_cash_units":operating_cash, "unmet_desired_work":backlog,
                          "served_work_cumulative":metrics["compact_served_work"]+metrics["large_served_work"],
                          "ordinary_rewards_microtu":metrics["ordinary_rewards_microtu"],
                          "continuity_rewards_microtu":metrics["continuity_rewards_microtu"]})
    desired_total = metrics["compact_desired_work"] + metrics["large_desired_work"]
    served_total = metrics["compact_served_work"] + metrics["large_served_work"]
    return {"scenario":name, "seed":seed, "reserve_enabled":reserve_enabled,
            "reserve_target_hours":reserve_hours, "retention_threshold_bps":retention_bps,
            "hours":F["days"]*24, "invariants":"passed",
            "initial_service_stock_microtu":tu.initial, "final_service_stock_microtu":tu.stock(),
            "fictional_warmup_contributor_issuance_microtu":F["historical_contributor_issuance_microtu"],
            "fictional_warmup_consumed_microtu":warmup_burn,
            "final_reserve_microtu":tu.balances["continuity"], "issued_microtu":tu.issued,
            "burned_microtu":tu.burned, "payment_total_units":money.stock(),
            "operating_cash_final_units":operating_cash, "operating_donations_units":operating_donations,
            "operating_spent_units":operating_spent,
            "service_fraction":round(served_total/desired_total,6) if desired_total else None,
            "p95_desire_satisfaction_hours":sorted(delays)[int((len(delays)-1)*.95)] if delays else None,
            "minimum_contracted_providers":coverage_min, "state_hours":dict(states),
            "metrics":dict(metrics), "resource_partition_checks":allocation_checks,
            "ledger_mutations":tu.moves+money.moves, "daily":daily}


def boundary_cases():
    cases = []
    ledger = Ledger({"user":100, "hold":0, "continuity":30, "provider":0})
    ledger.transfer("h1", "user", "hold", 70)
    assert ledger.transfer("h1", "user", "hold", 70) is False
    failed = False
    try:
        ledger.transfer("h2", "user", "hold", 40)
    except AssertionError:
        failed = True
    assert failed and ledger.balances["user"] == 30
    cases.append({"id":"C01","scope":"sequential duplicate and insufficient hold","status":"passed_reference"})
    before = ledger.stock()
    ledger.transfer("continuity", "continuity", "provider", 20)
    assert ledger.stock() == before and ledger.issued == 0
    cases.append({"id":"C02","scope":"continuity transfers do not mint","status":"passed_reference"})
    for amount in range(1, 101):
        assert sum(largest_remainder(amount, {"providers":90,"gateway":6,"operations":2,"reserve":2}).values()) == amount
    cases.append({"id":"C03","scope":"small-amount financial rounding conserves funds","status":"passed_reference"})
    for initial in range(0, 100, 7):
        candidate = Ledger({"a":initial})
        candidate.promise(100-initial, 100)
        candidate.issue(("issue",initial), "a", 100-initial)
        assert candidate.stock() == 100
    cases.append({"id":"C04","scope":"commitment becomes issued stock without exceeding ceiling","status":"passed_reference"})
    return cases


def main():
    runs = [simulate(name, seed) for name in SCENARIOS for seed in F["seeds"]]
    controls = [simulate(name, seed, reserve_enabled=False)
                for name in ("credit_overhang","correlated_exit","severe_combined_shock") for seed in F["seeds"]]
    sensitivities = [simulate("severe_combined_shock", seed, reserve_hours=hours, retention_bps=retention)
                    for hours in (24,168) for retention in (1500,6000) for seed in F["seeds"]]
    summary = []
    for name in SCENARIOS:
        subset = [r for r in runs if r["scenario"] == name]
        summary.append({"scenario":name, "runs":len(subset),
                        "service_fraction_min":min(r["service_fraction"] for r in subset),
                        "service_fraction_max":max(r["service_fraction"] for r in subset),
                        "hibernating_hours_max":max(sum(v for k,v in r["state_hours"].items() if k.startswith("HIBERNATING")) for r in subset),
                        "fraud_microtu_max":max(r["metrics"].get("undetected_fraud_microtu",0) for r in subset)})
    comparison = []
    for control in controls:
        selected = next(r for r in runs if r["scenario"] == control["scenario"] and r["seed"] == control["seed"])
        comparison.append({"scenario":control["scenario"],"seed":control["seed"],
                           "with_reserve_service_fraction":selected["service_fraction"],
                           "without_reserve_service_fraction":control["service_fraction"],
                           "difference":round(selected["service_fraction"]-control["service_fraction"],6)})
    report = {"status":"passed_model_invariants_not_real_world_validation",
              "policy_version":P["policy_version"], "policy_sha256":sha256(POLICY_PATH.read_bytes()).hexdigest(),
              "simulator_sha256":sha256(Path(__file__).read_bytes()).hexdigest(),
              "base_runs":len(runs), "control_runs":len(controls), "sensitivity_runs":len(sensitivities),
              "total_runs":len(runs)+len(controls)+len(sensitivities), "scenario_count":len(SCENARIOS),
              "days_per_run":F["days"], "boundary_cases":boundary_cases(),
              "summary":summary, "reserve_comparison":comparison,
              "limitations":["All hardware, price, cost and behavioral inputs are fictional.",
                             "Hourly aggregation does not validate lease timing, API queue latency, KV memory or model quality.",
                             "Deficit scheduling uses known payer identities; it does not detect real-world Sybil identities.",
                             "Quorum availability is an input gate, not an executed CometBFT network.",
                             "Experimental fraud bound assumes admission classification; mature verifier capture can exceed it.",
                             "No detector, GPU, bank, payment rail, consensus or production server was executed.",
                             "A controlled halt is permitted; invariant success does not imply uninterrupted or profitable service."],
              "runs":runs, "controls":controls, "sensitivities":sensitivities}
    target = BASE/"integrated-economy-simulations.json"
    target.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(json.dumps({k:report[k] for k in ("status","total_runs","scenario_count","days_per_run","summary","reserve_comparison")},indent=2))


if __name__ == "__main__":
    main()
