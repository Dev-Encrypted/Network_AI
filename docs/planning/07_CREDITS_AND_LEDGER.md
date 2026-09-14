# 07. Credits, obligations, and the ledger

## Units and ownership

Cooperative usage tokens (`TU`) represent the proposed accounting unit for contribution and consumption. They are separate from model text tokens and from money. Each qualified service profile has its own tariff and workload units. A larger model above 27B may consume more resources, but parameter count alone is not its price.

The current product uses `LAB_TU`, an explicitly issued laboratory balance. Its completed-work 80/20 split and full failure refund are private test rules, not the cooperative candidate below. [Executable accounting](../implementation/ACCOUNTING.md).

## Proposed balance lifecycle

A contribution contract identifies useful assigned capacity, accepted rate, readiness interval, verification, payment source, and maximum obligation. Uncontracted inventory does not automatically earn TU. A consumer quote identifies the exact profile, limits, price version, expiry, and maximum reservation.

Hold the consumer's balance before admission. The held portion remains owned accounting stock but is unavailable for another request. Settlement charges the accepted usage, routes the proceeds according to the contracted policy, and releases the unused reservation. A timeout, cancellation, invalid receipt, or dispute follows a defined policy instead of an arbitrary balance edit.

## Stock and exposure

The candidate separates:

| Symbol | Includes | Does not include |
|---|---|---|
| `S` | Issued TU, both free and held, including participant and cooperative funds | Another copy of an aggregate reporting balance |
| `L` | Future issuance already promised by accepted commitments | Transfers of existing TU already in S |
| `J` | Approved but unapplied reversals of burned TU | Refunds funded by recycling existing balances |

```text
E = S + L + J
```

Record issuance obligations when accepted, rather than waiting for payout. Do not count a hold as a burn. Do not mint a second unit merely because existing TU moved to a different account.

## Working funds and protected reserve

Candidate v6 gives the cooperative working account an essential renewal floor. Finalized consumption replenishes that floor, then the protected reserve, then the remaining normal working target, and burns only the excess. The protected reserve cannot become a source for ordinary expansion or cash expenses. [Complete candidate rules](24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md).

A refund must identify its original sources. Reversing a previously burned portion requires the authorized J path; returning existing recycled units requires reserving those units. Every business operation needs a stable identity so a retry cannot issue, refund, or charge twice.

## Integrity and trust

Use integer arithmetic, bounded amounts, explicit rounding, balanced entries, serializable transactions where required, and immutable committed journals for application roles. Publish reconciliation between ledger lines, account projections, outstanding holds, and future obligations.

The private PostgreSQL implementation demonstrates several of these protections. Its database owner remains trusted and can administer the database. Distributed confirmation, independent audit, and proof of honest work are separate requirements.

## What the simulation taught

The F0 economic study preserved its accounting invariants while failing all implemented economic acceptance gates in every run. A balanced ledger does not ensure that funded demand returns enough TU to renew useful capacity or that every participant cohort can consume service. Evaluate stock, recurring flow, and access together. [Economic results](../execution/ECONOMY_V1_RESULTS.md).
