# Bounded automatic renewal of essential capacity

Version 0.7 private preview · Dev-Encrypted · CC BY 4.0

The essential mechanism and v0.7 evidence below are preserved. Version 0.8 adds a separately authorized [demand-backed expansion mode](DEMAND_BACKED_EXPANSION.md). Active-permission uniqueness now includes coverage kind; omitted kind and old records remain essential. Expansion has zero reserve authority and cannot amend old pool terms.

A community fund can keep commissioning complete readiness windows without asking every participant to click Accept each time. It needs two separate, finite permissions: the fund manager's authority to commit credits and each provider's consent to participate. Every window is still fully funded and bound to exact terms before it starts.

This implements a private continuation mechanism for the [cooperative fund](COOPERATIVE_FUNDS.md). It does not issue credits, change prices, purchase hardware, expand an essential plan or promise continuous public availability. The installed 32B campaign uses one physical computer, one account and three agents. Multiple agents on that computer do not establish independent operators.

## A concrete example

Suppose a group has one complete route and a fixed price of 100 microcredits per second for 30-second windows. Each window needs 3,000 microcredits. The manager authorizes at most three windows, at most 9,000 gross working-capital microcredits, zero reserve spending and a five-minute validity period. Each provider separately authorizes up to three windows of its own components on that exact route.

Only 3,000 existing microcredits are initially contributed. Once every consent is present and the complete route is ready, the coordinator commits those credits and starts the first window. A consumer explicitly selecting this pool can use its route. Settled consumption replenishes the pool under the existing floor/reserve/target allocation. If enough free credit is available after the first window ends, the coordinator may fund the next one within the original permissions.

If a provider revokes future participation during the second window, that accepted window keeps its original deadline and payment rules. A third window cannot use the revoked permission, even if the fund has sufficient credit and the manager still allows another window. The provider can separately withdraw from an accepted readiness contract using that contract's existing exit operation; revoking a renewal permission does not perform that withdrawal.

## The two permissions

| Permission | Who creates it | Bound to | Hard limits |
|---|---|---|---|
| Fund authorization | Pool creator or private administrator | Pool policy, essential group, fixed duration and whole-window budget | Maximum windows, separate gross working and reserve commitments, expiry |
| Provider mandate | The authenticated provider owning a component | Pool policy, exact route/hash, provider identity, its component identities and shares | Maximum windows, expiry, readiness-only compensation |

The UI is **Cooperação → select the fund → Renovação automática com limites**. The two forms display each window's duration and budget. A provider sees only eligible routes containing its own components. An administrator cannot create a mandate impersonating another provider, although the private administrator retains revocation authority. The private administrator and database owner remain trusted parties.

Consent does not allocate extra physical capacity. Three agents sharing a physical resource domain still consume the same capacity slot. An alternative route needs valid mandates from all of its own providers; consent to one route does not transfer to another.

There can be one active fund authorization per essential group and one active mandate per pool/route/provider. Replacing limits requires revoking the prior active permission and creating a new one. Existing rows and their used counters remain available for inspection. A terminal permission cannot be reactivated. New permissions may be created once the old permission is terminal; they are new decisions, with new terms and limits.

Maximum windows range from 1 to 10,000. Expiry must be in the future, cover a full window plus ten seconds and be no more than 30 days away when permission is created. Each new window must also fit within the pool's declared operational support period. The interface accepts minutes and sends an absolute UTC expiry. All monetary amounts are integer decimal strings in micro-LAB_TU; `1 LAB_TU = 1,000,000 microcredits`.

## Gross commitments are not net expenditure

For a permission with a window cost `C`, the remaining authorities are:

```text
remaining_windows = maximum_windows - windows_used
remaining_working = maximum_working_microtu - working_committed_microtu
remaining_reserve = maximum_reserve_microtu - reserve_committed_microtu
```

All three counters derive from immutable window records. Committing one window consumes one window unit and `C` from its selected source's limit, in the same transaction as activation. The limits measure amounts placed at risk under accepted contracts, not merely the amount eventually paid.

If a 3,000-microcredit contract pays 2,000 and returns 1,000, its gross authorized commitment remains 3,000. Neither that refund nor new contributions or recycled consumer credits replenish the permission. Otherwise a small stated limit could silently authorize unlimited repeated commitments.

An authorization is permission, not a reservation of future funds. Only an actual window moves existing credits into its escrow. The fund may therefore have a valid authorization while waiting for free funds. Other eligible commitments and consumer refunds can change what is available. Every attempt rechecks the current state under the fund's lock.

| Available funds and remaining limits | Result |
|---|---|
| Free working funds and working authority each cover `C` | Use working capital |
| Free working funds are below `C`, and reserve funds and reserve authority each cover `C` | Use reserve and record the existing essential contingency incident |
| Working funds cover `C` but working authority does not | Wait; reserve cannot bypass that source limit |
| Neither permitted source can fund a complete window | Wait; do not combine partial sources or create credit |

The permission becomes exhausted when its window count is consumed or neither remaining source limit covers a full window. Provider limits are independent; sufficient manager authority cannot override an exhausted or revoked provider mandate.

## What happens in each renewal attempt

1. Lock the pool creator, pool and authorization in the same order as manual funding. Recheck the permission, pool policy, pause state and responsible accounts.
2. Require a full-duration window within both the authority's expiry and the declared support period. Wait for any offered, active or draining window of that group to finish.
3. Check remaining gross limits and currently free funds. Select a permitted source using the table above.
4. Consider qualified, fully ready and unclaimed alternative routes in the group's existing least-recently-awarded order. Skip alternatives without complete, current provider mandates. No weight or payout changes during selection.
5. Freeze the pool, fund authorization/hash, sequence, route and each provider mandate/hash into the new window's terms. Fund its complete escrow and accept those terms using the recorded mandates.
6. Insert the immutable renewal record and each distinct provider's usage. Database triggers project these into the limited counters. Commit activation, consent, resource claims, funds and limits together.

A failure at any point rolls back the entire financial attempt. An isolated test injects a database failure after the manager counter is projected and confirms that the window, escrow, claims and consumed limits all disappear before retry. Concurrent coordinator attempts serialize; they cannot fund the same group's next window twice.

The private coordinator reconciles every two seconds after existing readiness and cooperative accounting. An overlapping timer invocation is skipped; each pass considers at most 100 active authorizations, prioritizing those least recently attempted. This is a bounded private work queue, not a tested public throughput guarantee. A restart reads durable permissions and window records. It does not reconstruct spending authority from process memory or replay settled windows.

An accepted window ends before the next begins, so this implementation can have a gap between windows. A quote does not reserve a future renewal. Requests still obey the existing queue deadline and need an active matching window with enough execution time remaining. Do not promise uninterrupted service based on an active permission alone.

## Waiting, revocation and recovery

The panel reports the last evaluation: existing window, missing funds, unauthorized source, absent capacity, missing provider consent, insufficient deadline/support, paused pool or disabled responsible account. Repeated unchanged waits do not append duplicate history events. An unexpected transaction error produces a retry status after the transaction has rolled back.

Revocation applies to future windows and is idempotent. A permission that is already expired, exhausted or revoked retains that terminal state. Pausing a pool preserves existing contracts and their escrow. Updating the support period does not extend an authorization, provider mandate or accepted window.

Provider readiness is rechecked by the existing complete-route rules. Disabled accounts, stopped or stale agents, withdrawn route acceptance, mismatched epochs, changed identity or an unqualified model cannot activate a new valid window. Readiness payments during an accepted window retain the existing observation and interruption rules. Provider mandates are not proof of useful computation or cryptographic proof of each future acceptance: the trusted private coordinator exercises the explicit stored authority and records its source.

## API contracts

Paths below are relative to `/api/v1`. All require normal authentication; browser mutations require the configured origin. Idempotency identities are scoped to the authenticating issuer and bind the complete request. A retry must preserve the original UUID, expiry, reason and limits. The UI retains those values after a lost response.

| Method | Path | Operation |
|---|---|---|
| GET | `/cooperative/pools/:id/renewals` | Recent authorizations, mandates, eligible own routes, renewal windows and events |
| POST | `/cooperative/pools/:id/renewals` | Manager/admin creates bounded fund authority |
| POST | `/cooperative/pools/:id/provider-mandates` | Provider creates its own bounded participation mandate |
| POST | `/cooperative/renewals/:id/revoke` | Manager/admin revokes future fund authority |
| POST | `/cooperative/provider-mandates/:id/revoke` | Owning provider/admin revokes future participation |

Example fund request; replace the placeholders and use a future expiry that covers the chosen duration:

```json
{
  "group_key": "essential-32b",
  "policy_sha256": "replace with exact pool policy SHA-256",
  "maximum_windows": 3,
  "maximum_working_microtu": "9000",
  "maximum_reserve_microtu": "0",
  "expires_at": "replace with an ISO-8601 UTC timestamp",
  "idempotency_key": "replace with a new UUID",
  "reason": "Maintain three bounded essential windows within existing funds",
  "consent": "BOUNDED_GROSS_COMMITMENTS_NO_AUTOMATIC_LIMIT_INCREASE"
}
```

Example provider request:

```json
{
  "route_id": "replace with the exact route UUID",
  "policy_sha256": "replace with exact pool policy SHA-256",
  "maximum_windows": 3,
  "expires_at": "replace with an ISO-8601 UTC timestamp",
  "idempotency_key": "replace with a new UUID",
  "reason": "Accept bounded readiness-only windows for my route components",
  "consent": "READINESS_ONLY_BOUNDED_RENEWALS"
}
```

Revocation takes an empty object. The read endpoint returns up to 100 rows in each main history list and 50 recent events. This is a recent-activity view, not a complete ledger export. Stored accepted-window terms include the exact mandate IDs and hashes; the readiness panel distinguishes mandate-based consent from a direct acceptance.

## Persistence and verification

Migration 008 adds fund authorizations, provider mandates, immutable renewal runs, immutable provider usages and events, plus an optional mandate reference on readiness acceptances. Older manual acceptances retain a null reference. Migration 007 and all earlier applied migration bytes are preserved.

The runtime role cannot modify limits, expiry, accepted terms or usage counters directly. Definer triggers validate the newly activated window, current transaction, policy, source, whole budget, sequence, provider membership, consent and deadlines before projecting consumption. A deferred constraint requires a consumed mandate for every distinct provider before commit. Histories cannot be edited or deleted by the runtime role. These protections constrain application bugs; the database owner remains trusted.

`pnpm test:integration` includes 14 renewal cases on isolated PostgreSQL databases. They cover permissions, exact request binding, idempotency, missing consent, atomic activation, concurrent attempts, gross-limit exhaustion after refunds, revocation, expiry, reserve restrictions, unavailable capacity, alternative routes, late rollback and restricted database permissions. Test clocks and fabricated node observations are confined to those isolated databases.

`pnpm test:renewal` uses the already installed managed 32B CPU route. It contributes 3,000 existing microcredits, authorizes at most three 30-second windows, performs one actual inference, observes the automatic second window, revokes future provider consent while that window remains active and verifies that no third window starts despite unused fund authority and available credit/capacity. It then revokes remaining permissions, pauses the pool and preserves its balances. It creates no grants and downloads no model. Private output lives under `.runtime/private-lab/renewal-campaigns/`.

The [allowlisted real report](evidence/qwen3-32b-bounded-renewal.json), [restore report](evidence/renewal-backup-restore.json) and [versioned validation](validation-v0.7.json) record the actual outcomes. Browser coverage includes lost authorization-response retry, separate provider consent, future-only revocation, accepted-window payments and a 390-pixel mobile layout. Restore verification compares the same exported snapshot as the dump, including usage projections, original consent/deadline bindings and runtime-role permissions.

## What remains outside this result

The successful local cycle does not qualify a 24-hour recovery campaign, a new mature economic study, demand-backed expansion, contributor issuance, malicious-provider verification, distributed consensus, heterogeneous independent GPUs, WAN service or cash settlement. Existing failed F0 studies are preserved without reinterpretation. The [status register](STATUS.md) and [launch gates](../execution/GATES.md) continue to govern those claims.
