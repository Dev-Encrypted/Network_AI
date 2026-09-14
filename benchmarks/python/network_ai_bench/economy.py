"""Discrete-event experiment for the v6 cooperative policy.

The accounting is exact integer arithmetic. Physical service, attestation,
behavior and cash are explicitly fictional inputs; this is not the product ledger.
"""
from collections import Counter, defaultdict, deque
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import gzip
import heapq
import json
import math
import time

from .ledger import Ledger, WORKING, RESERVE

DAY = 86400


def draw(seed, kind, number):
    return int.from_bytes(sha256(f"{seed}:{kind}:{number}".encode()).digest()[:8], "big") / 2**64


@dataclass
class Request:
    id: int
    owner: str
    cohort: str
    model: str
    created: int
    deadline: int
    price: int
    state: str = "new"
    route: tuple = ()


class Experiment:
    def __init__(self, parameters, scenario, seed, variant):
        self.p = dict(parameters)
        self.scenario, self.seed, self.variant = scenario, seed, variant
        self.end = self.p["days"] * DAY
        self.mature_at = (self.p["days"] - self.p["mature_days"]) * DAY
        self.review = self.p["receipt_review_seconds"] * (3 if scenario == "slow_settlement" else 1)
        self.lease = self.p["lease_seconds"]
        self.split = variant.endswith("split")
        self.demand_driven = "demand" in variant
        self.priority = "v6" if variant.startswith("v6") else "reserve_first" if self.split else "single"
        self.ledger = Ledger()
        self.events, self.serial, self.now = [], 0, 0
        self.metrics, self.states = Counter(), Counter()
        self.daily, self.day_counts, self.cohorts, self.models = [], Counter(), defaultdict(Counter), defaultdict(Counter)
        self.day_cohorts, self.day_models = defaultdict(Counter), defaultdict(Counter)
        self.ready, self.busy, self.selected = {}, {}, Counter()
        self.requests, self.waiting = {}, set()
        self.last_arrivals = deque()
        self.small = list(range(self.p["small_nodes"]))
        self.large = list(range(len(self.small), len(self.small) + self.p["large_nodes"]))
        self.late_node = len(self.small) + len(self.large)
        self.owners = [f"node:{i}" for i in self.small + self.large] + [f"user:{i}" for i in range(self.p["nonprovider_accounts"])]
        self.cash = self.p["operating_cash_initial_days"] * self.p["operating_cash_cost_daily_units"]
        self.cash_initial = self.cash
        self.cash_in = self.cash_out = 0
        self.cash_shutdown = self.p["operating_cash_shutdown_days"] * self.p["operating_cash_cost_daily_units"]
        self.cash_paid_until = 0
        self.last_targets = (0, 0, 0)
        self.recovery_stable_since = 0
        self.day_recycled = self.day_normal_cost = self.day_reserve_spend = self.day_new = 0
        self.day_waits = []
        self.mature_start_balances = None
        self.capacity_history = deque(maxlen=7)
        self.mature_start_reserve = None
        self.commercial_buyer = 100000
        self.commercial_earned = 0

    def event(self, when, kind, payload=None):
        self.serial += 1
        heapq.heappush(self.events, (when, self.serial, kind, payload))

    def count(self, key, value=1, request=None):
        self.metrics[key] += value
        self.day_counts[key] += value
        if request:
            self.cohorts[request.cohort][key] += value
            self.models[request.model][key] += value
            self.day_cohorts[request.cohort][key] += value
            self.day_models[request.model][key] += value
        if self.now >= self.mature_at:
            self.metrics["mature_" + key] += value

    def quorum(self):
        return not (self.scenario in ("service_quorum_partition", "severe_combined_shock") and 10 * DAY <= self.now < 11 * DAY)

    def physical_nodes(self):
        nodes = self.small + self.large
        if self.scenario == "late_arrival" and self.now >= 30 * DAY:
            nodes = nodes + [self.late_node]
        if self.scenario == "all_inference_nodes_absent" and 12 * DAY <= self.now < 14 * DAY:
            return []
        if self.scenario in ("correlated_exit", "severe_combined_shock") and 12 * DAY <= self.now < (17 if self.scenario == "severe_combined_shock" else 15) * DAY:
            nodes = [n for n in nodes if draw(self.seed, "exit", n) >= 0.5]
        if self.scenario == "credit_overhang" and 20 * DAY <= self.now < 30 * DAY:
            nodes = [n for n in nodes if n == 0 or n in self.large]
        if self.scenario == "mixed_commercial" and self.now // 3600 % 24 in range(6, 12):
            nodes = [n for n in nodes if n != 5]
        return nodes

    def rate(self, node):
        return self.p["large_reward_microtu_per_lease"] if node in self.large else self.p["small_reward_microtu_per_lease"]

    def compatible_capacity(self, nodes):
        small = sum(n not in self.large for n in nodes)
        large_routes = sum(n in self.large for n in nodes) // 3
        return (small * (3600 // self.p["compact_service_seconds"]) * self.p["compact_price_microtu"]
                + large_routes * (3600 // self.p["large_service_seconds"]) * self.p["large_price_microtu"])

    def ceiling(self):
        # Conservative lower envelope of known daily capacity, including outages.
        hourly = min([self.compatible_capacity(self.physical_nodes()), *self.capacity_history])
        return hourly * 24 * 7 * 35 // 100

    def targets(self, essentials, contracted):
        core_per_lease = sum(self.rate(n) for n in essentials)
        normal_per_lease = sum(self.rate(n) for n in contracted)
        horizon = max(6 * 3600, self.review + self.lease)
        # Targets cover future leases after the present already-reserved interval.
        floor = core_per_lease * math.ceil(horizon / self.lease)
        working = max(floor, normal_per_lease * (DAY // self.lease))
        protected = core_per_lease * (3 * DAY // self.lease) if self.split else 0
        return floor, working, protected

    def can_issue(self):
        return self.now + self.lease + self.review < self.mature_at and self.now < self.p["bootstrap_max_days"] * DAY

    def lease_start(self):
        if self.now >= self.end:
            return
        self.ready.clear()
        self.busy = {n: end for n, end in self.busy.items() if end > self.now}
        online = self.physical_nodes()
        for node in online:
            self.count(f"eligible_lease_opportunities:{node}")
        small = sorted((n for n in online if n not in self.large), key=lambda n: (self.selected[n], n))
        large = [n for n in self.large if n in online]
        essentials = small[:1] + (large[:3] if len(large) >= 3 else [])
        wanted = list(essentials) if self.demand_driven else small + (large[:3] if len(large) >= 3 else [])
        floor, working, protected = self.targets(essentials, wanted)
        if self.demand_driven and len(self.waiting) > 1 and self.ledger.balance(RESERVE) >= protected:
            if self.now - self.recovery_stable_since >= DAY:
                for node in small[1:3]:
                    if self.ledger.balance(WORKING) - sum(self.rate(n) for n in wanted) - self.rate(node) >= floor:
                        wanted.append(node)
        self.last_targets = self.targets(essentials, wanted)
        operational = self.quorum() and self.now < self.cash_paid_until
        if not operational or not essentials:
            state = "NO_QUORUM" if not self.quorum() else "NO_CASH" if self.now >= self.cash_paid_until else "NO_PHYSICAL_ROUTE"
            self.recovery_stable_since = self.now
        else:
            # Fund a complete route atomically; large roles never earn in an incomplete route.
            groups = [[n] for n in wanted if n not in self.large]
            if len([n for n in wanted if n in self.large]) == 3:
                groups.insert(1, [n for n in wanted if n in self.large])
            for group in groups:
                value = sum(self.rate(n) for n in group)
                essential = all(n in essentials for n in group)
                source = None
                if self.ledger.balance(WORKING) >= value and (essential or self.ledger.balance(WORKING) - value >= floor):
                    source = WORKING
                elif self.can_issue() and self.ledger.exposure + value <= self.ceiling():
                    source = "issuance"
                elif self.split and essential and self.ledger.balance(RESERVE) >= value:
                    source = RESERVE
                if not source:
                    self.count("unfunded_ready_contracts", len(group))
                    continue
                for n in group:
                    assert n not in self.ready and n not in self.busy, "resource double reservation"
                    key = f"ready:{self.now}:{n}"
                    if source == "issuance":
                        assert self.ledger.promise(key, f"node:{n}", self.rate(n), self.ceiling())
                    else:
                        assert self.ledger.hold(key, source, self.rate(n), "ready")
                    self.ready[n] = self.now + self.lease
                    self.selected[n] += 1
                    self.day_normal_cost += self.rate(n)
                    self.count("normal_cost_microtu", self.rate(n))
                    if source == RESERVE:
                        self.day_reserve_spend += self.rate(n)
                        self.count("protected_contingency_commitment_microtu", self.rate(n))
                    self.event(self.now + self.lease, "ready_receipt", (key, n, source))
            if not self.ready:
                state = "ECONOMIC_HIBERNATION"
                self.count("economic_hibernation_seconds", self.lease)
                if self.now >= self.p["observation_starts_day"] * DAY:
                    self.count("observed_economic_hibernation_seconds", self.lease)
                self.recovery_stable_since = self.now
            elif any(n not in self.ready for n in essentials):
                state = "CONSERVATION"
                self.recovery_stable_since = self.now
            else:
                state = "NORMAL" if self.now - self.recovery_stable_since >= DAY else "RECOVERY"
        self.states[state] += self.lease
        self.day_counts["state_seconds:" + state] += self.lease
        for rid in sorted(self.waiting):
            self.try_start(self.requests[rid])
        self.event(self.now + self.lease, "lease")

    def ready_receipt(self, data):
        key, node, source = data
        # Offline/lying READY is an input to this simulation. Undetected fraud
        # remains payable, deliberately showing the limit of accounting proofs.
        self.count("ready_receipts")
        self.event(self.now + self.review, "ready_settle", data)

    def ready_settle(self, data):
        key, node, source = data
        if not self.quorum():
            self.event(self.now + 300, "ready_settle", data)
            return
        if source == "issuance":
            value = self.ledger.issue(key)
            self.day_new += value
            self.count("ordinary_new_issuance_microtu", value)
        else:
            value = self.ledger.pay_ready(key, f"node:{node}")
            self.count("recycled_ready_paid_microtu", value)
            self.day_recycled += value
        self.cohorts["large_provider" if node in self.large else "small_provider"]["ready_earned_microtu"] += value

    def bootstrap_allocations(self):
        if not self.can_issue() or not self.quorum():
            return
        free_limit = max(0, self.ceiling() - self.ledger.exposure)
        treasury = min(free_limit, self.ledger.contributor_issued // 19 - self.ledger.treasury_issued)
        if treasury:
            key = f"treasury:{self.now}"
            if self.ledger.promise(key, WORKING, treasury, self.ceiling(), "treasury"):
                self.ledger.issue(key)
                self.day_new += treasury
                self.count("ordinary_new_issuance_microtu", treasury)
        grant = min(max(0, self.ceiling() - self.ledger.exposure), self.ledger.contributor_issued // 49 - self.ledger.grants_issued)
        recipients = [x for x in self.owners if x.startswith("user:")]
        for i, owner in enumerate(recipients):
            value = grant // len(recipients) + (i < grant % len(recipients))
            key = f"grant:{self.now}:{i}"
            if value and self.ledger.promise(key, owner, value, self.ceiling(), "grant"):
                self.ledger.issue(key)
                self.day_new += value
                self.count("ordinary_new_issuance_microtu", value)

    def request_arrival(self, rid):
        if self.now >= self.end:
            return
        model_draw = draw(self.seed, "model", rid)
        share = self.p["large_share"]
        if self.scenario in ("large_model_rush", "severe_combined_shock") and 15 * DAY <= self.now < 25 * DAY:
            share = 0.95
        model = "large" if model_draw < share else "compact"
        if self.scenario == "new_model" and self.now >= 30 * DAY and model_draw > 0.7:
            model = "unqualified_new"
        owners = self.owners + ([f"node:{self.late_node}"] if self.scenario == "late_arrival" and self.now >= 30 * DAY else [])
        owner = owners[min(len(owners) - 1, int(draw(self.seed, "owner", rid) * len(owners)))]
        cohort = "newcomer" if owner.startswith("user:") else "large_provider" if int(owner.split(":")[1]) in self.large else "small_provider"
        price = self.p["large_price_microtu"] if model == "large" else self.p["compact_price_microtu"]
        req = Request(rid, owner, cohort, model, self.now, self.now + self.p["queue_seconds"], price)
        self.count("desired", request=req)
        retention = self.scenario == "hoarding" and cohort == "large_provider"
        retention |= self.scenario == "credit_overhang" and self.now < 20 * DAY
        if retention and draw(self.seed, "retention", rid) < 0.95:
            self.count("voluntarily_retained", request=req)
            return
        if self.ledger.balance(owner) < price:
            self.count("unfunded", request=req)
            return
        if model == "unqualified_new":
            self.count("unsupported_model", request=req)
            return
        self.count("funded_compatible", request=req)
        if not self.quorum() or self.now >= self.cash_paid_until:
            self.count("refused_503", request=req)
            return
        assert self.ledger.hold(f"usage:{rid}", owner, price, "usage")
        req.state = "queued"
        self.requests[rid] = req
        self.waiting.add(rid)
        self.event(req.deadline, "queue_deadline", rid)
        self.try_start(req)

    def try_start(self, req):
        if req.state != "queued" or self.now > req.deadline:
            return
        duration = self.p["large_service_seconds"] if req.model == "large" else self.p["compact_service_seconds"]
        ready = [n for n, until in self.ready.items() if until >= self.now + duration and self.busy.get(n, 0) <= self.now]
        if req.model == "large":
            route = tuple(n for n in self.large if n in ready)
            if len(route) != 3:
                return
        else:
            candidates = [n for n in ready if n not in self.large]
            if not candidates:
                return
            route = (min(candidates),)
        req.route = route
        req.state = "running"
        self.waiting.remove(req.id)
        self.count("accepted", request=req)
        wait = self.now - req.created
        self.count("queue_wait_seconds", wait, req)
        self.day_waits.append(wait)
        cancelled = draw(self.seed, "cancel", req.id) < self.p["cancel_probability"]
        if cancelled:
            duration = max(1, duration // 2)
        for n in route:
            assert self.busy.get(n, 0) <= self.now
            self.busy[n] = self.now + duration
        self.event(self.now + duration, "request_done", (req.id, cancelled))

    def queue_deadline(self, rid):
        req = self.requests[rid]
        if req.state == "queued":
            self.waiting.remove(rid)
            self.ledger.release(f"usage:{rid}")
            req.state = "queue_expired"
            self.count("refused_429_or_capacity_503", request=req)

    def request_done(self, data):
        rid, cancelled = data
        req = self.requests[rid]
        for n in req.route:
            if self.busy.get(n) == self.now:
                self.busy.pop(n)
        failure = draw(self.seed, "failure", rid) < self.p["failure_probability"]
        if cancelled or failure:
            self.ledger.release(f"usage:{rid}")
            req.state = "cancelled" if cancelled else "failed"
            self.count(req.state, request=req)
        else:
            req.state = "pending_review"
            self.count("visible_completed", request=req)
            self.event(self.now + self.review, "usage_settle", rid)
        for waiting in sorted(self.waiting):
            self.try_start(self.requests[waiting])

    def usage_settle(self, rid):
        req = self.requests[rid]
        if not self.quorum():
            self.event(self.now + 300, "usage_settle", rid)
            return
        key = f"usage:{rid}"
        if draw(self.seed, "review_refund", rid) < self.p["detected_refund_probability"]:
            self.ledger.release(key)
            req.state = "refunded_before_finalization"
            self.count("review_refunds", request=req)
            return
        w, r, burned = self.ledger.finalize_usage(key, *self.last_targets, self.priority)
        self.count("finalized_consumption_microtu", req.price, req)
        self.count("recycled_consumption_microtu", w + r, req)
        self.count("burned_microtu", burned, req)
        self.count("settled_requests", request=req)
        req.state = "finalized"
        if self.scenario in ("undetected_experimental_fraud", "severe_combined_shock") and draw(self.seed, "fraud", rid) < 0.05:
            self.count("undetected_bad_outputs_charged", request=req)
        if draw(self.seed, "late_refund", rid) < self.p["post_finalization_refund_probability"]:
            self.event(self.now + 3600, "refund_approve", rid)

    def refund_approve(self, rid):
        if not self.quorum():
            self.event(self.now + 300, "refund_approve", rid)
            return
        key = f"reversal:{rid}"
        if self.ledger.approve_reversal(key, f"usage:{rid}"):
            self.event(self.now + 300, "refund_post", rid)
        else:
            self.count("unfunded_reversal_attempts")
            self.event(self.now + 3600, "refund_approve", rid)

    def refund_post(self, rid):
        if not self.quorum():
            self.event(self.now + 300, "refund_post", rid)
            return
        self.ledger.post_reversal(f"reversal:{rid}")
        self.count("posted_charge_reversals", request=self.requests[rid])

    def cohort_balances(self):
        result = Counter()
        for owner, value in self.ledger.free.items():
            if owner.startswith("node:"):
                result["large_provider" if int(owner[5:]) in self.large else "small_provider"] += value
            elif owner.startswith("user:"):
                result["newcomer"] += value
        return dict(result)

    def day_boundary(self):
        self.ledger.audit()
        if self.now:
            balances = self.cohort_balances()
            self.daily.append({"day": self.now // DAY - 1, "S": self.ledger.S, "L": self.ledger.L, "J": self.ledger.J,
                               "exposure": self.ledger.exposure, "ceiling_for_new_promises": self.ceiling(),
                               "working_free": self.ledger.balance(WORKING), "protected_free": self.ledger.balance(RESERVE),
                               "holds": sum(h.value for h in self.ledger.holds.values()), "cohort_free": balances,
                               "new_issuance": self.day_new, "normal_cost": self.day_normal_cost,
                               "recycled_payout": self.day_recycled, "reserve_spend": self.day_reserve_spend,
                               "cash": self.cash, "counters": dict(self.day_counts),
                               "cohort_counters": dict(self.day_cohorts), "model_counters": dict(self.day_models),
                               "queue_wait_p95": sorted(self.day_waits)[max(0, math.ceil(len(self.day_waits) * .95) - 1)] if self.day_waits else None})
        self.day_counts.clear()
        self.day_cohorts = defaultdict(Counter)
        self.day_models = defaultdict(Counter)
        self.day_recycled = self.day_normal_cost = self.day_reserve_spend = self.day_new = 0
        self.day_waits.clear()
        if self.now >= self.end:
            return
        if self.now == self.mature_at:
            self.mature_start_balances = self.cohort_balances()
            self.mature_start_reserve = self.ledger.balance(RESERVE)
        # Regular member funding is a declared operating input, never a TU sale.
        # The mature phase receives no extraordinary bail-out and cannot spend
        # the protected shutdown cash. The funding-loss scenario stops this input.
        if not (self.scenario == "operating_funding_stops" and self.now >= 10 * DAY):
            self.cash += self.p["operating_cash_regular_daily_units"]
            self.cash_in += self.p["operating_cash_regular_daily_units"]
        cost = self.p["operating_cash_cost_daily_units"]
        if self.cash - cost >= self.cash_shutdown:
            self.cash -= cost
            self.cash_out += cost
            self.cash_paid_until = self.now + DAY
        assert self.cash == self.cash_initial + self.cash_in - self.cash_out >= self.cash_shutdown
        if self.scenario == "mixed_commercial" and self.commercial_buyer >= 60:
            self.commercial_buyer -= 60
            self.commercial_earned += 60
        assert self.commercial_buyer + self.commercial_earned == 100000
        self.capacity_history.append(self.compatible_capacity(self.physical_nodes()))
        self.bootstrap_allocations()
        self.event(self.now + DAY, "day")

    def run(self):
        self.event(0, "day")
        self.event(0, "lease")
        interval = DAY / self.p["requests_per_day"]
        for rid in range(self.p["days"] * self.p["requests_per_day"]):
            when = int(rid * interval + draw(self.seed, "arrival", rid) * interval)
            if self.scenario == "zero_use":
                continue
            if self.scenario == "idle_then_return" and 5 * DAY <= when < 20 * DAY and draw(self.seed, "quiet", rid) > 0.05:
                continue
            self.event(when, "arrival", rid)
        dispatch = {"day": self.day_boundary, "lease": self.lease_start, "arrival": self.request_arrival,
                    "ready_receipt": self.ready_receipt, "ready_settle": self.ready_settle,
                    "queue_deadline": self.queue_deadline, "request_done": self.request_done,
                    "usage_settle": self.usage_settle, "refund_approve": self.refund_approve, "refund_post": self.refund_post}
        while self.events:
            when, _, kind, payload = heapq.heappop(self.events)
            if when > self.end:
                break
            self.now = when
            if payload is None:
                dispatch[kind]()
            else:
                dispatch[kind](payload)
        self.ledger.audit()
        mature = self.daily[-self.p["mature_days"]:]
        funded = sum(d["counters"].get("funded_compatible", 0) for d in mature)
        complete = sum(d["counters"].get("visible_completed", 0) for d in mature)
        mature_cost = sum(d["normal_cost"] for d in mature)
        mature_recycled = sum(d["recycled_payout"] for d in mature)
        end_balances = self.cohort_balances()
        depletion = {k: end_balances.get(k, 0) - v for k, v in (self.mature_start_balances or {}).items()}
        gates = {
            "accounting_and_resource_invariants": True,
            "observed_no_economic_hibernation": self.metrics["observed_economic_hibernation_seconds"] == 0,
            "mature_funded_compatible_slo": funded > 0 and complete / funded >= .95,
            "mature_no_new_issuance": sum(d["new_issuance"] for d in mature) == 0,
            "mature_no_protected_spend": sum(d["reserve_spend"] for d in mature) == 0,
            "mature_recycled_payout_covers_normal_cost": mature_cost > 0 and mature_recycled >= mature_cost,
            "mature_no_cohort_free_balance_depletion": bool(depletion) and min(depletion.values()) >= 0,
            "no_undetected_bad_output_charged": self.metrics["undetected_bad_outputs_charged"] == 0,
        }
        return {"scenario": self.scenario, "seed": self.seed, "variant": self.variant,
                "synthetic_days": self.p["days"], "metrics": dict(self.metrics), "states_seconds": dict(self.states),
                "cohorts": dict(self.cohorts), "models": dict(self.models), "selection_counts": dict(self.selected),
                "mature_cohort_free_delta": depletion, "mature_funded_compatible": funded,
                "mature_visible_completed": complete, "mature_funded_completion_fraction": complete / funded if funded else None,
                "gates": gates, "synthetic_candidate_passed": all(gates.values()), "public_launch_approved": False,
                "tail_pending_not_discarded": {"holds": len(self.ledger.holds), "promises": len(self.ledger.promises), "reversals": len(self.ledger.reversals)},
                "daily": self.daily}


def worker(job):
    parameters, scenario, seed, variant = job
    return Experiment(parameters, scenario, seed, variant).run()


def study(manifest, output, phase, workers=4):
    manifest_path = Path(manifest)
    spec = json.loads(manifest_path.read_text(encoding="utf-8"))
    out = Path(output)
    out.mkdir(parents=True, exist_ok=False)
    seeds = spec[phase + "_seeds"]
    jobs = [(spec["parameters"], scenario, seed, variant) for seed in seeds for scenario in spec["scenarios"] for variant in spec["variants"]]
    provenance = {"study_id": spec["study_id"], "phase": phase, "manifest_sha256": sha256(manifest_path.read_bytes()).hexdigest(),
                  "source_sha256": {p.name: sha256(p.read_bytes()).hexdigest() for p in (Path(__file__), Path(__file__).with_name("ledger.py"))},
                  "started_at_utc": datetime.now(timezone.utc).isoformat(), "planned_runs": len(jobs), "workers": workers,
                  "seeds": seeds, "evidence_type": "SYNTHETIC_EVENT_MODEL", "declared_limits": spec["declared_limits"]}
    (out / "provenance.json").write_text(json.dumps(provenance, indent=2), encoding="utf-8")
    started = time.monotonic()
    grouped = defaultdict(lambda: {"runs": 0, "passed": 0, "failed_gates": Counter(), "funded": 0, "completed": 0})
    with gzip.open(out / "runs.jsonl.gz", "wt", encoding="utf-8") as raw, ProcessPoolExecutor(max_workers=workers) as pool:
        for i, result in enumerate(pool.map(worker, jobs, chunksize=1), 1):
            raw.write(json.dumps(result, separators=(",", ":")) + "\n")
            group = grouped[result["scenario"] + "/" + result["variant"]]
            group["runs"] += 1
            group["passed"] += result["synthetic_candidate_passed"]
            group["funded"] += result["mature_funded_compatible"]
            group["completed"] += result["mature_visible_completed"]
            group["failed_gates"].update(k for k, v in result["gates"].items() if not v)
            if i == 1 or i % 25 == 0 or i == len(jobs):
                print(json.dumps({"completed": i, "total": len(jobs), "elapsed_seconds": round(time.monotonic() - started, 1)}), flush=True)
    report = {**provenance, "completed_runs": len(jobs), "elapsed_seconds": round(time.monotonic() - started, 2),
              "groups": dict(grouped), "public_launch_approved": False,
              "raw_sha256": sha256((out / "runs.jsonl.gz").read_bytes()).hexdigest()}
    (out / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report
