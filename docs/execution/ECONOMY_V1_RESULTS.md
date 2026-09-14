# F0 economic event study: tested configuration rejected

The study contains **5,600 runs of 90 simulated days**. Twenty calibration seeds and fifty distinct holdout seeds were registered for five variants and sixteen scenarios. The same code and parameters were used for both phases. Prices, speeds, behavior and operating support were fictional.

The [verifiable summary](evidence/economy-v1-summary.json) binds the study and raw data hashes. The [preregistered manifest](../../benchmarks/economy-study-v1.json) has SHA-256 `7853701865fd848517958132c04ee0220924969ca0d121474054789db59f7598`.

## What ran

The event simulator represents individual requests, 900-second capacity contracts, a 120-second queue, 24-hour receipt review (72 hours in the delay scenario), cancellation, failures and reversals of finalized charges. Balances begin at zero. Future readiness issuance enters L before commitment; held issued balances remain in S; approved reversal of burned TU enters J. Refunding recycled amounts requires existing reserved funds.

The last 30 days suspend ordinary issuance. External operating money is a separate fictional counter, with an explicit recurring support assumption and a scenario losing that support. The baseline does not require cash buyers. No real credits or financial transfers occurred.

All cases preserved implemented accounting and resource-reservation invariants. **No case passed every implemented economic acceptance gate.** Balanced postings did not ensure circulation, coverage or usable access.

## Baseline comparison

Aggregate visible completion of compatible funded requests in the mature period across fifty holdout seeds. The registered target is 95%; capacity refusals remain in the denominator.

| Variant in the common event environment | Completion | Result |
|---|---:|---|
| v4: availability, one fund | 47.36% | Rejected |
| v5: demand, one fund | 15.75% | Rejected |
| v5: availability, separated funds | 70.32% | Rejected; also consumes protected funds |
| v5: demand, separated funds | 39.90% | Rejected; also consumes protected funds |
| v6: demand, essential floor replenished first | 15.75% | Rejected |

These are policy decompositions in the new event simulator, not identical reruns of the historical v4 hourly program.

## Observed cause within the fictional scenario

Essential coverage consists of one compact route and one large route. The large route needs three providers at 2 TU/hour each; the compact route costs 1 TU/hour. Continuous coverage therefore costs 168 TU/day before expansion. The scenario generates 96 desired uses/day with prices of 2 TU and 8 TU, with 25% of desired requests targeting the large model.

Desired demand does not automatically become funded consumption. Compact providers receive a smaller share of payments, and many requests lack balance. Large providers accumulate TU that does not return to operation at the same rate. Initial issuance supports part of the imbalance; coverage falls when it ends. Replenishing the essential floor first fixes priority but does not create the missing flow.

In v6 calibration seed 1001, the large cohort finishes with 3,933.5 free TU and the compact cohort with 8.25 TU, while the final day records zero new contract cost. This is a traceable concentration/stoppage example under the fictional inputs, not a prediction of actual participants.

## Implication

FC02 remains open. Revise essential coverage, contract windows, funded demand and cohort liquidity together. Low-demand models may need scheduled or requester-funded coverage; publishing a model does not require the common fund to keep it continuously online.

The intended focus above 27B makes complete-route coverage and multi-provider obligations especially relevant. Actual route costs and contribution capacity must come from qualification rather than copying these three-provider fictional assumptions.

A revised study needs new parameters and fresh holdout seeds. The fifty seeds here have been observed and cannot be presented as unseen validation for a policy adjusted to these results. No real participant's balance should be retroactively reduced to fix a failed configuration.

## Coverage limits

Availability, retention, price and cash support are assumptions. Attestation and quorum are simulated conditions, not deployed consensus or physical verification. Elastic 1/2/4 limits are not integrated. The 24-hour recovery criterion needs a complete evaluator starting when **all** minimum prerequisites return.

The raw field `synthetic_candidate_passed` refers only to implemented gates. The summary explicitly records `full_policy_acceptance_evaluated=false`. The data includes unfunded demand, queues/refusals, payment sources, free/held balances, daily series, provider selection and cohort contribution/consumption.

This study rejects the tested configuration without proving all cooperative designs impossible. It approves neither real economics, market prices nor public opening. [Data restoration](../publication/README.md).
