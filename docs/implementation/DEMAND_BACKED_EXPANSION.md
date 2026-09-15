# Expanding capacity only when demand can support it

Version 0.8 private preview · Dev-Encrypted · CC BY 4.0

NETWORK AI can now open a bounded **additional complete-route window** alongside essential coverage. Expansion uses existing working credits, separate provider consent, current funded requests and recorded private economic evidence. It cannot spend the protected reserve, reduce the essential floor, rewrite an old plan or replenish anyone's spending authorization.

This is a private executable controller. It is not a public anti-Sybil system or proof of sustainable economics. Positive activation is tested with explicitly fabricated identities, readiness and clock conditions in an isolated PostgreSQL database. On the actual one-computer 32B profile, expansion correctly stayed blocked while ordinary cooperative inference worked. [Evidence and validation](validation-v0.8.json).

## Start with the distinction that matters

Three different things can look like growth:

| Observation | What it actually supports |
|---|---|
| More credits in the fund | A larger ability to fund contracts; it does not demonstrate consumer demand |
| More simultaneous requests on already covered idle resources | A temporary admission allowance, within existing capacity |
| More paid readiness windows on additional resources | Expansion; it creates another bounded operating obligation and needs the checks below |

The existing temporary 1/2/4 admission policy continues to manage spare capacity. It does not create a new balance or finance another route. This addition concerns the third row.

A **complete route** includes every part needed to finish a request. Adding an agent name does not add a physical resource domain. Models above 27B remain the recommended focus, but a model's parameter count alone cannot determine its number of contributors. A larger model needs a qualified partition and suitable memory and links; higher traffic also needs enough replicas or service slots. [Model scaling](../MODEL_SCALING.md), [complete routes](COMPLETE_ROUTES.md).

## What must be true before a new window starts?

All ten checks apply together. A passing preview is informative; the transaction checks eligibility again before committing funds.

| Check | Implemented rule | Reason |
|---|---|---|
| Original plan permits expansion | New `private-cooperative-floor-first-v2` terms explicitly permit separate private expansion authorization | Old participants did not consent to a later policy rewrite |
| Stable recovery | The fund satisfies `NORMAL`, with 24 hours of continuous qualifying observations and no observation gap longer than six seconds | A deposit or a single healthy heartbeat must not instantly establish recovery |
| Working floor | Free working credits after funding the entire additional window remain at or above the essential floor | Optional capacity must not consume essential renewal funds |
| Protected reserve | The complete 72-hour essential reserve is present | Expansion cannot substitute for continuity protection |
| Operating support | The exact authorization names an unrevoked private support declaration covering the whole window and its margin | Credits alone do not pay electricity, connectivity or maintenance |
| Essential coverage | Every essential group currently has a ready, accepted window with more than ten seconds remaining | Optional growth must not precede the essential set |
| Contract headroom | Existing sponsor contracts plus reserved space for uncovered essential groups leave room under the shared four-contract ceiling | Expansion must not occupy slots needed by other supported essential plans |
| Recurring private flow | Net retained qualifying consumption over the rolling 24 hours covers positive normal readiness cost over that interval | Contributions, grants and unbacked projected demand are not recurring consumption |
| Funded pressure | Eligible queued parties exceed the free slots in currently covered routes | Spare covered resources should serve existing work first |
| Additional complete route | Another qualified route is ready and all its domains are unclaimed and unoccupied | A second route name or a busy resource is not additional usable capacity |

The same pool/group can have one open essential window and one open expansion window. Offered, active and draining contracts all count as open. Groups and sponsor limits further bound simultaneous commitments. There is no unlimited replica launch, automatic model installation, price change or minting path.

An active fund authorization still needs valid mandates from **every distinct provider** on the chosen route. Every mandate, manager limit, policy hash, route hash, expiry and actor status is checked. These permissions remain finite even when all economic checks pass.

## The accounting calculation

Let `r` be the sum of essential per-second prices across the pool. Let `H` be the remaining eligible budgets of its essential windows. All values below are integer micro-LAB_TU; one LAB_TU contains one million microcredits.

```text
essential floor F = max(0, 21,600 × r − H)     # six hours
working target W* = max(0, 86,400 × r − H)     # 24 hours
reserve target R* = 259,200 × r               # 72 hours
extra window C   = group rate × group duration

Expansion funding requires:
    free working W − C ≥ F
    free reserve R ≥ R*
    remaining authorized working commitment ≥ C
    remaining authorized window count ≥ 1
```

**Expansion escrow never counts toward `H`.** Otherwise an optional contract could appear to prepay essential work and incorrectly lower its protection. The displayed total held amount includes both kinds, while the essential floor calculation includes only essential budgets. Consumption recycling still follows floor → reserve → remaining working target → nonspendable burn. [Detailed allocation](COOPERATIVE_FUNDS.md).

Every expansion authorization sets its maximum reserve amount to exactly zero. A source change cannot turn it into an essential contingency authorization. Existing essential authorizations retain their original source rules.

For a positive **isolated fixture**, a group costs 100 microcredits/second and has 60-second windows. The essential contract has 5,900 remaining after observed fixture payments; `F = 2,154,100`. Free working capital is 3,154,000 and reserve is 25,920,000. A 6,000-credit expansion leaves 3,148,000 working credits, above the floor. Two classified consumer parties have aged funded requests while one covered slot is free. A second whole route has separate fixture domains, and all providers have expansion mandates. The transaction starts that route and consumes one request as its justification. The identities, domain readiness and 25-hour clock in this example are test inputs, not physical or economic observations.

## Which requests count?

An eligible request must:

1. Belong to this pool, group model and exact frozen pool policy, with the current qualified manifest.
2. Be `QUEUED / HELD`, have a strictly positive hold, and retain the corresponding original hold journal entry.
3. Be at least ten seconds old, with more than ten seconds left before its queue deadline.
4. Belong to an enabled account with a currently valid economic-party classification.
5. Be classified separately from the pool creator and **every provider in the group's allowed routes**. Unknown classifications fail closed.
6. Never have justified an earlier expansion.

Requests are deduplicated by economic party, with at most 100 considered per evaluation. Several accounts under common control do not become several independent units of pressure. Consumer request identifiers are omitted from the aggregate eligibility response; the selected identifier is retained internally in immutable contract evidence.

The transaction consumes one eligible request's identity when it opens an expansion window. That permanent one-use claim prevents a waiting request from repeatedly justifying growth. A later cancellation, refund or expired contract does not erase the claim or restore spending limits. Expansion is a shared pool window, not a promise that this particular requester will be the next one served; normal admission fairness still applies.

Free slots are derived from ready accepted coverage and domain capacity minus active session reservations. Shared domains are conservatively packed once. Extra candidates with any current readiness claim or active session reservation are excluded. Failed readiness or concurrent admission causes reevaluation or a rolled-back attempt, not an overlapping commitment.

## What “independent” means in this preview

A private administrator records an **economic party**, then assigns accounts to that party with source references, document SHA-256 and an expiry. Party and affiliation creation times come from the database clock. The runtime cannot backdate them, change an account's recorded party or rewrite the evidence. Revocation is final; a replacement is a new declaration. An expired classification does not silently renew.

For historical consumption, classifications are evaluated **at the original settlement time**. A classification added today cannot qualify yesterday's previously unknown consumption. If a classification is revoked now, it stops new eligibility while retaining its historical interval. The system does not retroactively rewrite economic history when an administrator later learns that an earlier declaration was wrong; such a correction still requires a future dispute/evidence policy before public use.

The qualifying flow calculation is:

```text
net retained flow = qualifying working + reserve allocations settled in the last 24h
                  − exact retained allocations reversed by refunds in the last 24h
normal cost       = actual working-funded readiness payments in the last 24h
```

Refund outflows are subtracted even if their original charge was older than the current interval. Grants, initial balances, direct contributions, protected transfers and burned amounts are excluded from retained flow. Readiness costs include essential and expansion windows funded from working capital. A zero-cost interval cannot qualify growth.

These classifications are **administrative declarations**, not proof of beneficial ownership or a public defense against collusion. Private consumption still uses LAB_TU; this does not certify its original economic backing in real money. An administrator or database owner can lie about evidence. Independent verification, correction procedures, public exposure limits and mature cohort studies remain launch requirements.

## Operating support is separate from credits

The administrator records the resources and responsibilities offered, a source reference, document hash and an expiry. The explicit consent is `PRIVATE_IN_KIND_SUPPORT_NO_VERIFIED_CASH_CLAIM`. A manager then binds a particular support record into its expansion authorization. Its support hash is frozen into each accepted expansion window.

This records a bounded private in-kind commitment. It does not verify a bank balance, purchase electricity, establish an audited budget or close FC06. Replacing support requires a new authorization referencing the new support record; the old grant does not silently acquire a longer lifetime. Disabling its author or revoking/expiring the declaration prevents subsequent expansion.

Declarations must initially last longer than one minute and no more than 30 days. The next accepted window must fit within the declaration, manager permission, provider mandates and the pool's operational support period, including the admission margin where checked.

## Use the interface

The current product UI is PT-BR. The public manual is English.

1. Open **Cooperação** (Cooperation), choose a newly created plan, and expand **Renovação automática com limites** (Bounded automatic renewal).
2. Open **Expansão conforme a demanda** (Demand-backed expansion). Read every pending condition, the flow/cost amounts and the eligible-party versus free-slot counts.
3. A private administrator can open **Administrar declarações econômicas privadas** to register parties, account affiliations and operational support. Use actual reviewed information. Classify accounts under shared control together.
4. In **Autorizar gastos do fundo**, select **Expansão condicionada à demanda**, choose the exact support record, set gross working/window limits and expiry, and consent. Reserve is fixed at zero. This does not allocate capacity yet.
5. Each provider signs in and uses **Autorizar minha participação como operador**, selecting expansion explicitly. An essential mandate is insufficient.
6. Inspect the authority's status and used counters. Revoke future spending, future participation or operating support when appropriate. Already accepted contracts keep their terms and observed-readiness payment rules.

After a lost response, retry the unchanged form. It reuses the same request identity and absolute expiry. Changing the form represents a different proposed declaration or permission. Old plans explicitly show that their original policy does not permit expansion; their existing essential credits and contracts remain usable under those terms.

## API contract

Paths below are relative to `/api/v1`. All use authenticated application access; administrative declarations require the administrator role. The browser proxy exposes these exact routes and retains the existing origin protections.

| Method and path | Purpose |
|---|---|
| `GET /admin/economics` | Up to 200 recent parties and affiliations, including revocation history |
| `POST /admin/economics/parties` | Immutable party with `name`, `evidence_sha256`, `source_reference`, `idempotency_key` |
| `POST /admin/economics/affiliations` | Time-bounded account classification with `user_id`, `party_id`, evidence fields, `expires_at` and idempotency |
| `POST /admin/economics/affiliations/:id/revoke` | End future eligibility; keep historical interval |
| `POST /cooperative/pools/:id/operating-support` | Support `scope`, `policy_sha256`, evidence fields, expiry, idempotency and explicit private-support consent |
| `POST /cooperative/operating-support/:id/revoke` | End support for future expansion |
| `POST /cooperative/pools/:id/renewals` | Existing bounded authority plus `coverage_kind: "EXPANSION"`, `operating_support_id`, zero maximum reserve |
| `POST /cooperative/pools/:id/provider-mandates` | Existing mandate plus `coverage_kind: "EXPANSION"` and `READINESS_ONLY_BOUNDED_EXPANSION` consent |
| `GET /cooperative/pools/:id/renewals` | Existing history plus aggregate `expansion` checks, `operating_support` and each record's coverage kind |

Omitting `coverage_kind` means `ESSENTIAL`. Existing omitted-kind request hashes retain their idempotency behavior. A mode cannot be edited into an existing permission. There is one active manager authority per pool/group/kind and one active provider mandate per pool/route/provider/kind.

Amounts remain integer strings. Evidence hashes require 64 hexadecimal characters. Source references contain 20–300 characters; operating scopes contain 40–1,000. IDs are UUIDs, deadlines are UTC ISO timestamps, and the [renewal limits](BOUNDED_RENEWALS.md) remain in force.

An economic refusal is recorded as `EXPANSION_<GATE_NAME>`, with the full current `blocked_by` list in the aggregate view. Separate statuses such as `WAITING_FOR_OPERATORS`, `WAITING_FOR_WINDOW` and `EXHAUSTED` still describe permission or lifecycle constraints. A failed transaction consumes no credits, counters, claim or demand record.

## Failure and recovery behavior

| Event | Result |
|---|---|
| Demand disappears before commitment | Reevaluate or roll back; no partial contract |
| Two coordinators attempt the same permission | Serializable sponsor/pool/permission locks and unique records allow one window |
| Evidence insert fails after provider acceptance | Entire transaction rolls back, including escrow and used limits |
| Support, affiliation or a future mandate is revoked | Stop new qualifying work; keep accepted contract obligations |
| An accepted stage fails | Existing readiness draining and per-component payment rules apply |
| Funds return from an unused window | Return to the original source; gross authority remains consumed |
| Essential window expires while expansion is open | Essential renewal remains independently eligible; expansion escrow does not replace its floor |
| A restored database contains accepted expansion | Restore preserves its kind, demand/support bindings and cumulative permission usage |

The reconciliation batch remains limited to 100 active manager authorities, chosen by attempt age; essential permissions run before expansion within that batch. One private coordinator remains the deployment model. This scheduling policy is not distributed consensus, failover or a guarantee of zero gaps between windows.

## What was actually measured?

The real installed official 32B CPU route used one host, one account and three signed agents. A 3,000-microcredit contribution funded one essential 30-second window. A real request used 19 input and seven output tokens, completed in 4,054 ms and recycled a 40,000-microcredit charge. The essential window paid 3,000. No grant was issued.

Separate expansion permissions and actual local in-kind support were registered. Nevertheless, eligible independent pressure and qualifying retained flow remained zero; there was no second physical route, full reserve or 24-hour healthy campaign. Expansion committed **zero** windows and **zero** credits. This demonstrates a useful private cycle with honest refusals. [Allowlisted real report](evidence/qwen3-32b-expansion-gates.json).

Seventeen new integration cases exercise positive activation, separate consent, affiliated and unknown parties, floor/reserve protection, recovery gaps, support expiry, refunds and retrospective classification, physical aliases, cancellation/deadlines, one-use demand, concurrency, late rollback, preserved essential renewal, old-policy compatibility, sponsor headroom and restoration. Their fabricated conditions remain confined to isolated databases. A restored fixture snapshot contained seven consumed expansion claims; a separate working-database restore contained zero, as expected. [Fixture restore](evidence/expansion-fixture-restore.json), [working restore](evidence/expansion-backup-restore.json).

This implementation does not approve the rejected F0 economic parameters, public issuance, real commercial payments, independent WAN/GPU routes or a public pilot. Those remain separately tracked in [FC01–FC06](../execution/GATES.md).
