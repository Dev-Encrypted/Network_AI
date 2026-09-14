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

A valid charge cannot exceed the hold. The private experiment allocates 80% to the provider and 20% to the lab working account, subject to integer fee rounding. Unused held funds return to the consumer. These proportions have not been established as public-network economics.

Failure, cancellation and interruption return the full reservation. Inconsistent usage creates `DISPUTED` billing, zero charge and a failed terminal outcome. A consumer can receive partial work before cancelling without paying for it under this private rule. That behavior is a laboratory subsidy requiring a different abuse and partial-delivery policy before an open market.

There is no automatic provider income merely for remaining online. Version 0.3 adds an explicit, separately funded availability contract: a sponsor reserves existing LAB_TU, the provider accepts, and the coordinator pays observed ready intervals from that escrow. Unpaid funds return to the sponsor. Temporary admission quotas also respond to demand. These additions do not implement the candidate cooperative issuer, reserve controller or accepted market economics. See [funded availability and quotas](AVAILABILITY.md) and the separate [proposed economy](../planning/24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md).

## Database protections

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
