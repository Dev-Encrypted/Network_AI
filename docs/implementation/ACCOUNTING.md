# Laboratory accounting and trust boundaries

## Unit and maximum reservation

`LAB_TU` is an integer test unit with 1,000,000 micro-units per displayed unit. It is separate from proposed cooperative TU, has no cash redemption, and does not represent guaranteed future capacity. New accounts start at zero. The administrator bootstrap and later grants are explicit auditable postings against `LAB_ISSUER`.

Text-token counts and credit prices are different. Each immutable manifest defines input rate, output rate and denominator. Using bounded integer arithmetic:

```text
charge = ceil((input_tokens × input_rate + output_tokens × output_rate) / denominator)
hold = charge(max_context_tokens - requested_output_tokens, requested_output_tokens)
```

Rates and charges use micro-units. The hold is conservative and can exceed typical usage. Reserved funds cannot pay for another active request. A quote freezes the manifest, prices, output limit and expiry. The session cannot silently switch to another model.

## Settlement and failure

A completed receipt needs valid positive usage, a completed stream, a finish reason, and counts within authorized limits. The node signs the receipt; control verifies identity, attempt and epoch. Counts are **reported by the inference engine**, without independent tokenization or cryptographic proof of computation.

A valid charge cannot exceed the hold. Ordinary inference allocates 80% to the provider and 20% to the lab working account, subject to integer fee rounding. Unused held funds return to the consumer. These proportions have not been established as public-network economics.

For a version 0.4 complete route, the same provider pool is divided among its immutable participants after every required receipt arrives. Adding stages does not multiply the token bill. Prefix rounding conserves every micro-unit, and the interface displays significant digits down to one micro-LAB_TU. The [route guide](COMPLETE_ROUTES.md#how-the-credits-are-divided) gives a measured 32B example and explains why signed stage observations are still a private trust assumption.

Failure, cancellation and interruption return the full reservation. Inconsistent usage creates `DISPUTED` billing, zero charge and a failed terminal outcome. A consumer can receive partial work before cancelling without paying for it under this private rule. That behavior is a laboratory subsidy requiring a different abuse and partial-delivery policy before an open market.

There is no automatic provider income merely for remaining online. Version 0.3 adds an explicit, separately funded availability contract: a sponsor reserves existing LAB_TU, the provider accepts, and the coordinator pays observed ready intervals from that escrow. Unpaid funds return to the sponsor. Temporary admission quotas also respond to demand. These additions do not implement the candidate cooperative issuer, reserve controller or accepted market economics. See [funded availability and quotas](AVAILABILITY.md) and the separate [proposed economy](../planning/24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md).

Version 0.5 funds a complete route under one additional readiness budget. Prefix rounding assigns exact component maximums; each component earns `floor(maximum × credited_ms / window_ms)`. Their sum cannot exceed the held budget. Healthy components preserve their accepted entitlements when a peer fails, so component earnings and joint-route-ready time are recorded separately. The sponsor cannot reclaim other providers' accepted window early. Terminal closure returns the remaining escrow and releases every readiness domain claim. [Lifecycle, arithmetic and real 32B example](ROUTE_AVAILABILITY.md).

Readiness reserve, payment and refund use `ROUTE_AVAILABILITY_RESERVE`, `ROUTE_AVAILABILITY_PAYMENT` and `ROUTE_AVAILABILITY_REFUND` journal kinds. They transfer existing LAB_TU without touching `LAB_ISSUER` or automatically spending `lab:working`. The underlying inference tariff and its separate provider payment remain unchanged. These statements preserve v0.5 additional-readiness terms; the opt-in v0.6 contract below adds a separate compensation mode.

## Version 0.6 cooperative mode

New immutable essential plans own separate `COOP_WORKING`, `COOP_CORE_RESERVE` and `COOP_BURN` accounts. Explicit contributions debit existing member balances. Working funds contract complete routes; reserve funds require a recorded essential shortfall incident. Every provider accepts `READINESS_ONLY` compensation for pool sessions. Accepted sessions freeze the pool, policy and coverage window, and require the same complete execution/receipt evidence as ordinary sessions.

Finalized consumption goes to the working floor, then reserve, then the working target, with excess sent to the nonspendable burn sink. The allocation, prior free balances and target values are recorded atomically with the original consumer charge. A full administrator-approved refund debits those exact original destinations and returns the original charge once. Insufficient free source funds reject the refund without issuing credits or disturbing escrow. Gross historical grants remain visible; the burn sink is excluded from spendable circulation. There are no asynchronous approved-but-unapplied reversals in this atomic private flow.

[Formulas, state predicates, conservation example and real 32B cycle](COOPERATIVE_FUNDS.md) distinguish this implementation from the unqualified broader issuer/expansion policy. Accounting consistency alone does not validate prices or independent economic circulation.

## Database protections

Version 0.7 introduces [bounded renewal authority](BOUNDED_RENEWALS.md) without a new minting or payout path. Immutable whole-window records project gross working/reserve commitments into the fund's limits; immutable provider usages project separately into each provider's window limit. Creating authority does not move funds. Actual activation reserves a complete budget and consumes permissions in one transaction. Returning unused escrow does not replenish the authorized gross limits. Revocation preserves existing readiness and consumer obligations.

Version 0.8 adds [demand-backed expansion](DEMAND_BACKED_EXPANSION.md) using those existing transactional contracts. Expansion is working-only, keeps free working funds above the essential floor, and requires the complete protected reserve. Its escrow is included in total held balances but excluded from the essential budgets that reduce the floor. One immutable request claim prevents repeated growth from the same queued work. Neither a direct contribution nor a grant becomes qualifying recurring flow; retained qualifying consumption is measured net of refund outflows. Private account classifications and in-kind support are evidence declarations, not a cash asset or independently verified ownership.

Only newly created v2 plans permit separately authorized expansion. An old v1 pool's frozen policy and consumption-allocation version are preserved. Essential contracts and permissions never silently become expansion. Restored databases retain both coverage kinds, their demand/support bindings and lifetime usage counters.

- Every journal transaction has at least two lines whose sum is zero at commit.
- Triggers project entries into balances; user accounts cannot become negative.
- The runtime role cannot directly update balances or insert a nonzero initial balance.
- Committed journals, lines, receipts and events cannot be rewritten or deleted by that role.
- A committed journal cannot receive later lines, even a balanced pair.
- Business identities make hold and settlement retries idempotent.
- Global balances reconcile to zero, and each account projection matches its journal lines.

These properties were also checked after restoring a dump. The PostgreSQL owner still has administrative powers. This is not a decentralized ledger immutable against a malicious administrator.

## Content and resource trust

NestJS and PostgreSQL do not receive prompt or answer bodies. The browser proxy, gateway, agent and engine see content in memory; the engine controls its own retention. Model output is not executed as HTML by the UI. The profile does not enable model-provided tools, arbitrary remote code or user-directed URL fetching.

Model hashes and GPU capacity are operator declarations with private administrative qualification. Domain grouping prevents oversubscription among correctly assigned agents; it does not detect every false physical identity in an untrusted network. Invitations and account limits are operational controls rather than independent anti-Sybil proof.

The project focuses on models above 27B, but charging a model profile does not prove a distributed route can execute it. Larger-model capacity, cooperative issuance, adversarial verification and cash settlement remain separate [launch requirements](STATUS.md).
