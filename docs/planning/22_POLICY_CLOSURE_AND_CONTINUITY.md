# 22. Continuity, reserves, and governance

## Preserve accepted rights during failure

A network can lose a contributor, route, gateway, ledger quorum, or funding source. Continuity rules must identify which new promises stop, which accepted obligations remain, how resources drain, and what evidence permits recovery.

The proposed cooperative funds separate normal work from a protected essential-service reserve. Candidate v6 refines their replenishment priority in [chapter 24](24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md). A reserve is bounded recovery time, not a guarantee that unavailable hardware will return.

## Operating states

| State | Meaning | Response |
|---|---|---|
| NORMAL | Essential routes and accepted normal commitments are fundable | Contract minimum justified coverage; expand only under all budget conditions |
| DEFENSE | Essential renewal or failure replacement requires protected support | Record the incident and fund only the predefined essential contingency set |
| RECOVERY | Minimum prerequisites returned and budgets are rebuilding | Renew gradually; require the candidate stability interval before normal expansion |
| HIBERNATING | Complete routes, minimum funding or external operation are missing | Stop new affected promises, drain, reconcile and preserve balances/checkpoints |
| No ledger quorum | Safe shared confirmation is unavailable | Stop new spending regardless of economic state |

A return of GPU memory alone is not full recovery. Resources, quorum, working liquidity and external funding all matter. The F0 study has not implemented the full evaluator for the candidate 24-hour recovery condition.

## Reference federation

The historical design proposes four independent organizations with equal power, a quorum of three, and an existing CometBFT/ABCI integration path. Inference-node admission and validator admission are separate. This is a federation candidate, not permissionless Bitcoin consensus and not a current deployment.

Confirmation authorizes a ledger transition. It does not prove a contributor's hardware or numerical computation. Independent verification and a bounded dispute process remain necessary. Four processes controlled by one person do not satisfy four independent operators.

## Policy changes

The candidate preserves accepted contracts under their agreed version. Ordinary tariff changes have advance notice and bounded frequency/variation; changes to rights, issuance and governance have a longer notice process and quorum. Emergency rules can stop new admissions under existing policy without deleting balances.

Record the policy version and sources for each obligation. A new target or price must not retroactively reclassify finalized funds. Contributor exit requires explicit handling of outstanding leases, holds, disputes and identity state.

## Recovery material

Protect model/engine manifests, account and obligation records, authority and node keys, receipts, and checkpoints. Artifact caches may be recoverable from verified sources; identity and accounting state have different retention requirements.

The private product demonstrates node epoch fencing, durable receipt retries, and isolated PostgreSQL restore checks. It does not demonstrate a replacement independent coordinator or cross-host key/data restoration. The trusted database owner remains inside the current security boundary.

## Opening and closure costs

Before public opening, the candidate calls for confirmed operating support and a protected orderly-closure budget, with actual responsible operators and pilot evidence. If those conditions cannot be met, reduce future scope or pause. Do not treat unconfirmed donations, users' deposits, or fictional TU as cash runway.

See [operations](11_OPERATIONS_AND_ECONOMICS.md), [candidate v6](24_CLOSURE_PROGRAM_AND_LAUNCH_GATES.md), and [FC05/FC06](../execution/GATES.md).
