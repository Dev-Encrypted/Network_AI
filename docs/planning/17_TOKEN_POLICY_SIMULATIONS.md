# 17. Early usage-token reference calculations

## Historical scope

The first token-policy package contains 18 deterministic examples. It was created before the later cooperative continuity revisions and F0 event study. These examples check selected formulas under fictional inputs; they are not a running ledger, GPU benchmark, or economic approval.

- [Original policy](evidence/token-economy-policy.json)
- [Reference calculator](evidence/simulate_token_economy.py)
- [Recorded examples](evidence/token-economy-simulations.json)

Their exact bytes remain historical evidence. Some descriptive values retain the original Portuguese language. The maintained English explanation is this chapter.

## What a reference calculation can prove

Given fixed inputs, a deterministic example can verify rounding, a price calculation, a cap, or a specific counterexample. It can catch an inconsistent formula before implementation. It does not demonstrate that participants will consume at the assumed rate, that hardware will be available, or that adversarial contributors will behave honestly.

A formula may conserve balances while leaving some participants unable to buy service. A nominal capacity budget may also include resources that cannot form a complete route. Those questions require a dynamic study with model-specific capacity, funded demand, and participant cohorts.

## How the later work differs

The cooperative and continuity revisions add explicit working/protected funds, bounded commitments and more detailed lifecycle rules. Candidate v6 changes replenishment order. The later F0 simulator represents individual events over 90 days and evaluates multiple variants and shocks. It still does not implement every candidate predicate.

Do not combine the number of arithmetic examples with event-study runs as if they are the same test type. Do not present the initial policy as the currently selected public runtime configuration.

## Reproduction and interpretation

Read the policy, calculator source, and recorded input/output together. Preserve their source hashes. If a formula changes, write a new policy and output rather than overwriting the historical example. The legacy planning verifier targets its archived tree, not the current application checkout.

Continue with [cooperative examples](21_COOPERATIVE_SIMULATIONS.md), [earlier integrated study](23_INTEGRATED_ECONOMY_SIMULATIONS.md), [candidate v6](24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md), and the [actual F0 outcome](../execution/ECONOMY_V1_RESULTS.md).
