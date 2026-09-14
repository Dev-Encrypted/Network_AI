# 24. Candidate v6 operating policy and launch gates

**English editorial edition: September 14, 2026. Original candidate: revision 6, September 13, 2026.** This chapter explains the selected cooperative design and preserves its experimental constants. It does not approve its economics or change runtime configuration. The later F0 event study rejected the tested settings, and the current product uses separate `LAB_TU` rules.

The [original full revision](../publication/README.md) and [structured policy](evidence/operating-policy-v6.json) remain preserved. For current observed gate status, use [FC01–FC06](../execution/GATES.md).

## 1. Selected model

Use a cooperative network with useful-capacity contracts, circulating internal usage credits, and an optional market between identified counterparties. Contribution commitments and consumption reservations have separate budgets reconciled in the same cooperative record. Bounded issuance can support entry or approved growth; it must not hide a recurring deficit.

| Alternative | Decision and reason |
|---|---|
| Pay every online node | Rejected: an advertised device may be unnecessary, unavailable, duplicated, or unable to support redemption |
| Pay only generated text tokens as the cooperative rule | Rejected for the target design: this does not compensate explicitly contracted readiness |
| Mutual credit with negative member balances | Deferred: adds default and collection risk before cooperation has been validated |
| Mandatory expiry, yield on balances, or a tradable currency | Outside the pilot: these change rights and incentives without supplying useful capacity |
| Funded readiness, circulation and separated reserves | Selected candidate: preserves contribution and limits obligations |
| A mandatory payment chain for the entire network | Rejected: optional sellers can declare their settlement method independently of TU |

Community members should be able to propose models and operate compatible nodes. Every configuration still needs licensing, runtime, memory, connectivity and complete-route qualification. **Models above 27B are the recommended focus**; their resource needs must be measured rather than inferred as a fixed number of people.

## 2. Working liquidity before reserve replenishment

The earlier v5 replenished the protected reserve before normal working liquidity. A counterexample: the working fund is empty, the protected reserve is short by 100 microTU, and finalized consumption returns 100 microTU. Sending it all to the reserve leaves nothing for normal essential renewal.

Candidate v6 preserves these compartments:

| Account or control | Purpose | Boundary |
|---|---|---|
| `COOP_WORKING` | Normal useful-capacity commitments | Has an essential renewal floor and a normal operating target |
| `COOP_CORE_RESERVE` | Qualified essential contingency routes | Cannot fund normal expansion, grants, or cash expenses |
| `COOP_CONTINUITY` | Aggregate reporting view | No independent postings; do not count it again in stock |
| External operating funds | Actual cash or defined in-kind support | Separate from TU |
| Commercial funds | Customer/seller deposits and obligations | Not free cooperative operating cash |

Funds held for leases, sessions, or approved refunds are unavailable for new promises. Their balances remain in issued stock. Targets below concern free funds for obligations not already covered by holds.

### Floors and targets

- `F`: cost of essential renewals not yet funded during horizon `H`.
- `H`: the greater of the six-hour reference and conservative settlement delay plus one maximum lease.
- `W*`: the greater of `F` and the unfunded approved normal operating cost for the next 24 hours.
- `R*`: cost of 72 hours of the qualified essential contingency set, rather than the whole advertised fleet.

Six, 24 and 72 hours are candidate test references. If measured settlement requires more liquidity, recalculate targets and show they fit the exposure cap, or reduce scope. Do not impose a 24-hour working ceiling when the necessary floor is larger.

### Deterministic replenishment

For finalized consumption `q` and free balances `W` and `R`:

```text
a = min(q, max(0, F - W))
p = min(q - a, max(0, R* - R))
w = min(q - a - p, max(0, W* - W - a))
b = q - a - p - w
W_after = W + a + w
R_after = R + p
q = a + p + w + b
S_after = S_before - b
```

The order is **essential working floor → protected reserve → remaining working target → excess burn**. In the counterexample, `F=60` and `W*=100` send 60 to working and 40 to protected funds. This transfer issues nothing. If consumption cannot cover the floor, the system must acknowledge insufficient funding and constrain new commitments.

Record policy version, previous balances, targets and each destination. Refunds trace their original sources and cannot exceed or duplicate the original operation. Reversing recycled funds is not permission to mint them again. Changing a target does not redistribute finalized amounts retroactively.

## 3. Contract complete useful capacity

Select complete routes from justified coverage and funded demand before selecting providers. Include weights, session memory, prefill, decode, communication, loading and contingency. A fragment with no complete usable route is not normal coverage.

Each contract has one of three reasons: essential coverage, demand-backed expansion, or a bounded experiment. Self-calls, advertised balances, identity count and raw generated-token volume do not create another reason.

```text
reward = verified_READY_duration × accepted_assigned_capacity_rate
```

Carry rounding remainders across intervals. Explicitly contracted idle readiness earns under its terms; announcements, downloads and uncontracted availability do not automatically earn. All parts share the route's approved budget, so splitting an identity cannot multiply compensation.

Among equivalent qualified offers, use auditable rotation by known operator, useful capacity and opportunity already received. Publish selection rates, waiting and rejection reasons by class. This cannot guarantee simultaneous work for every idle contributor.

### Expansion conditions

New expansion or renewal requires all of the following:

1. Independent compatible demand justifies the additional capacity.
2. Existing contracts are preserved without duplicate physical reservations.
3. Normal funding covers the new hold while preserving the essential working floor.
4. The protected reserve is replenished and external operation is funded.
5. Group/epoch budgets and issuance limits are respected.

If a condition fails, stop new expansion, drain accepted work under its terms, and recalculate the plan. Do not evict valid sessions to improve a budget metric. If a distributed route disappears, honor useful components' accepted leases through draining and avoid renewing purposeless fragments.

## 4. Operating states

| State | Entry | Action |
|---|---|---|
| NORMAL | Essential routes are fundable from working funds and authorized issuance; ledger and external funding are healthy | Contract minimum justified coverage; expand only under every condition |
| DEFENSE | An essential renewal or contingency replacement cannot use normal sources | Record the incident and use protected funds only for the predefined essential set |
| RECOVERY | Minimum conditions returned and budgets are rebuilding | Renew gradually; require 24 hours of stability before normal expansion |
| HIBERNATING | A complete route, minimum funding or external operation is absent | Stop new affected promises, drain, and preserve balances/checkpoints |
| Ledger without quorum | Safe confirmation is unavailable | Block new spending regardless of economic state |

Every protected use has a unique incident, policy, route, deadline and hold. If the entire essential set cannot be funded, operate only a previously qualified and funded subset. Recovery needs resources, quorum, liquidity and external support; it is not automatic if those conditions never return.

## 5. Close three different accounts

### Stock and issuance exposure

`S` includes all free and held issued TU. `L` includes committed future issuance only. `J` includes approved but unapplied reversals of burned TU only. Transfers of existing funds remain within `S`.

```text
E = S + L + J
new_authorizable_issuance <= max(0, 0.35 × C_ref_7_days - E)
```

Retain group/epoch caps, a collective allocation no greater than contributor issuance divided by 19, and grants no greater than contributor issuance divided by 49. Recycling does not generate another allocation or grant base. These are experimental prudential parameters, not an immediate redemption or financial-value guarantee.

`C_ref` uses jointly qualified resources and fixed reference prices. Raising a public tariff does not increase physical capacity. Do not inflate the reference to pass a budget check.

### Recurring cooperative flow

```text
recurring_coverage = finalized_recycled_TU_in_period / normal_TU_cost_in_period
```

Exclude new issuance, protected-reserve transfers, extraordinary donations and initial balances from recurring sources. A ratio below one indicates a deficit at the tested scope. Reduce future commitments, revise demand/cost assumptions, or declare a bounded subsidy. Increasing price may reduce demand and cannot be assumed to fix the problem.

Require a 30-day mature phase with fixed scope and load, no ordinary new issuance, no extraordinary injections, and no decline in working/protected balances used to hide a deficit. Also measure participant balances and access: consuming their starting stock until they cannot use the system is not a sustainable result. Separate fixed-cohort studies from experiments involving entry and exit.

### Available service and cohort access

Cross-reference who contributes, what they wish to consume, their spending liquidity, and complete routes. Credits earned on compact models do not create a giant-model route. Global totals of TU or VRAM cannot approve coverage.

Count desired requests, compatible funded requests, and admitted requests separately. Temporary route absence and capacity rejections stay in the compatible denominator. Report unfunded demand and contributors without opportunity too.

Publish how many fixed reference requests an accepted contribution hour can buy for each class, with model, tokenizer, precision, context, output and load held constant.

## 6. Bootstrap without fictional public balances

The cooperative candidate starts from funded infrastructure and explicitly time-bounded hardware contributions. It does not copy a simulator's initial stock into a real genesis or mint founder balances without a source.

1. Qualify capacity and calculate conservative reference capacity.
2. Authorize short initial leases within exposure limits; issue only after verified readiness.
3. Form funds through bounded allocations, finalized useful consumption, and voluntary transfers of existing TU with recorded sources.
4. Reconcile free funds, holds, participant balances and L/J together.
5. Open a pilot only after approved targets and participants' ability to consume have been demonstrated.

Do not require a purchase to contribute or compel contributors to return earnings. If the bootstrap does not fit actual capacity and demand, reduce scope or extend the experiment rather than adding an invisible issuance exception.

The private product's explicit 100 LAB_TU administrator grant is a **different laboratory mechanism**. It is not implementation of this public bootstrap policy.

## 7. Low demand and heterogeneous GPUs

Retain candidate temporary concurrency limits of 1/2/4 per configuration, with recent signals and gradual promotion. Extra headroom can permit additional funded requests; it cannot enlarge context, mint a permanent bonus, change prices, or reuse protected standby as uncommitted throughput. Stop granting new extras when queues return while preserving accepted terms.

Keep bounded queues, deadlines and retry budgets. Device, OS, engine, model, quantization and network profiles remain distinct. A complete model on one node, a nearby cluster, and a cross-participant pipeline require separate qualification.

The project's above-27B focus strengthens the need for complete-route planning. More parameters at a fixed precision generally require more weight memory and contributed capacity, but a fixed user count cannot be derived without device and topology assumptions. [Sizing explanation](../MODEL_SCALING.md).

TU remains an internal usage unit. Text tokens measure model workload; other modalities require their own declared units and compatible implementations. There is no universal TU-to-text-token equivalence.

## 8. Optional commercial integration

The historical first adapter reference is x402 batch settlement on an EVM test path, Base Sepolia, test USDC and TypeScript. This is an optional integration candidate, not a required cooperative currency. No contract, facilitator release, custody or withdrawal service is qualified by this document.

One seller assumes responsibility for the whole route toward the buyer. Subcontracted stages require funded agreements before acceptance. Record seller, buyer, profile, maximum price, unit, funding sources, measurement, finality, payout, dispute responsibility and maximum loss. A per-call price ceiling is separate from a wallet funding cap.

Do not promise atomic settlement across unrelated currencies or networks. Retries cannot charge twice. Failure of another stage cannot erase an accepted component's readiness obligation. Payouts, fees and allocated losses must fit the offer's budget.

Qualification includes concurrent ceilings, persistent authorizations, replay, partial/streamed work, restart, reconciliation, disputes, and withdrawal while the original gateway is unavailable. Refund/repair funding must exist before a public offer. A failed adapter stays disabled without preventing otherwise healthy cooperation.

Compute margin from finalized service revenue minus provider obligations, payments, attributed infrastructure, support and loss provisions. Deposits, TU and third-party funds are not revenue. A cheaper API claim requires equivalent quality, workload, latency and measured costs.

## 9. Governance and rule stability

The reference ledger uses four independent organizations, equal power, a quorum of three, and an existing CometBFT/ABCI integration path. Inference-node entry and validator entry have separate rules. This is not Bitcoin-style permissionless validation and is not implemented in the private coordinator.

Ledger confirmation authorizes transitions rather than proving hardware or computation. The historical candidate retains 2/3 attestation, newcomer review, aggregated exposure limits and dispute rights; release, dependencies, verifier independence and costs need qualification before execution.

Ordinary tariff changes require at least 48 hours' notice, at most one table per day, and an initial per-profile variation bound of 10%. Rights, issuance and governance changes use the longer seven-day process and quorum. Accepted contracts keep their agreed version. An incident can stop new admission under existing rules without erasing balances.

## 10. Experiment that can accept or reject the candidate

The [19 v6 reference checks](evidence/v6-policy-reference-checks.json) establish selected arithmetic and counterexamples only. They are not a market simulation, hardware proof or consensus deployment.

An integrated study must model lease and queue periods, receipt review, finality, cancellation, exits and refunds; compare policy variants on common loads and shocks; and disclose every remaining simplification. The original planned design uses 20 calibration seeds and 50 distinct holdout seeds over 90 days, with the last 30 days testing maturity without ordinary issuance.

Include no cash buyers with useful use, no use, concentrated demand, hoarding, correlated entry/exit, new models, settlement delays, lost operating support, undetected fraud and resource return. Publish per-profile/cohort time series, free/held stock, normal costs, funding sources, waits, rejections, provider selection, and contribution-to-consumption ratios.

Baseline acceptance requires no accounting or resource invariant violations, no economic hibernation under approved load, at least 95% of compatible funded requests completed within contract, no hidden mature-phase deficit, and cohort access within the declared envelope. Shocks may degrade service, but recovery must occur within 24 hours after all minimum resources, quorum, liquidity and external support return, without resetting balances.

**Later F0 result:** 5,600 cases were run, with zero passing all implemented economic gates. The baseline v6 holdout completion rate was 15.75%. Full elastic behavior and the complete recovery evaluator remain missing. The observed holdout is now historical; a revision tuned to it needs new seeds. [Analysis](../execution/ECONOMY_V1_RESULTS.md).

## 11. Responsibilities and launch order

| Gate | Responsible role to assign | Required evidence |
|---|---|---|
| FC01: contracts | Architecture and ledger | Consistent executable rules, stock/obligation sources and persistent concurrency behavior |
| FC02: economics | Economic analysis and scheduler | Complete study, mature coverage and cohort access |
| FC03: capacity | Inference and measurement | Qualified models/devices/links and measured contribution-to-consumption relation |
| FC04: optional market | Payments and seller operation | Settlement, payouts, dispute funding and exit |
| FC05: trust and continuity | Security and independent operators | Adversarial tests, quorum, partitions, restoration and replacement |
| FC06: funded pilot | Operations and finance | Confirmed resources and successful actual pilot campaigns |

Assign these roles to real people or organizations; the plan does not assume a funded team. Main sequence: contract coherence, capacity and economic tests with calibration loops, independent trust/continuity, then a funded pilot. Start larger-model and identity research early. Do not make the first private inference bench wait for payments or four organizations, and do not call that bench a public decentralized service.

The candidate requires 30 days of confirmed operation and seven days of orderly closure coverage before opening. Below 30 days of runway, freeze costly expansion; below 14, restrict costly paths while preserving closure funding. In-kind resources specify capacity and duration. Actual 7/30-day pilot campaigns remain required.

The design remains a candidate with explicit reasons to reduce scope or pause. Current approval status is maintained in the [gate register](../execution/GATES.md).
