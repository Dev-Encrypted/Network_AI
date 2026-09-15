# Private-preview implementation and validation status

## Version 0.5 additions

Complete-route readiness now has one pre-funded budget, immutable per-component maximums, exact-term acceptance by every distinct provider, shared-domain exclusion across both readiness APIs, and fixed-window draining. A failed or withdrawing stage stops earning its own future entitlement; eligible peers preserve their accepted obligations. Remaining escrow is returned to the sponsor at the fixed end. The PT-BR interface exposes funding, consent, component payments, joint-ready time and closure. This compensation is explicitly additional to normal inference settlement.

The September 14 local campaign used the already-installed official 32B CPU route and actual signed agents. A 30-second window paid 25,483 micro-LAB_TU and refunded 4,517. An API pause stopped one stage's readiness earnings while its peers continued earning. After resumption, a real inference completed with 18 input and seven output tokens and separately settled 39,000 microcredits. No new grant, model copy or cash transfer was used. [Exact terms and evidence](ROUTE_AVAILABILITY.md), [allowlisted report](evidence/qwen3-32b-route-availability.json).

Coverage adds 13 real-PostgreSQL cases to the previous 34 and a seventh browser journey, including a lost funding response retried without a duplicate hold. Readiness escrow, component projections, domain claims and restricted permissions are included in isolated backup restoration. [Version 0.5 validation](validation-v0.5.json). As with v0.4, the actual model evidence uses one account and one physical host. Common-fund circulation, the candidate reserve/issuance controller, independent verification and a successful economic study remain unfinished.

## Preserved version 0.4 campaign

The official 32.8B Q4_K_M model now executes through a complete route containing one root and two signed stage agents. The coordinator freezes every participant's epoch, resource domain and share; reserves all domains atomically; requires all claims before root execution; and settles only after the root and both stage receipts arrive. The browser exposes proposal, consent, withdrawal and private qualification, with participant amounts in session details. A managed installer and start/stop support the whole local CPU group.

The September 14 real-model campaign completed three short requests, with 18 input and 6 output tokens each. Every worker observed six completed graph commands. Two concurrent submissions executed without overlapping the single shared physical slot. Deliberately terminating one stage produced `FAILED / REFUNDED`, zero charge, with the consumer stream left connected. Each stage needed one nonbillable initialization computation; the explicit startup budget closed before consumer requests. [Protocol, results and limitations](COMPLETE_ROUTES.md), [raw allowlisted result](evidence/qwen3-32b-complete-route.json).

This evidence uses one physical host and one operator account. Separate signatures establish agent identity within the trusted private profile. They do not establish independent providers, correct work by malicious nodes, heterogeneous GPU suitability, WAN usability or viable market pricing. Public launch gates remain open.

Automated coverage for this version includes 34 real-PostgreSQL tests, seven artifact/RPC socket tests, nine Rust tests, 21 preserved Python F0 checks and six browser journeys. Isolated restoration preserved the journal, route tables, participant payout projection and restrictive permissions. The installed 32B route also completed a real browser-proxy request after a full group stop/start. [Version 0.4 evidence summary](validation-v0.4.json).

## Preserved version 0.3 campaign

That increment added an authenticated Iroh/QUIC bridge for the actual private node protocol, portable operator invitations, fully funded availability contracts, temporary 1/2/4 admission quotas, verified artifact acquisition and a trusted local CPU cluster adapter. The [link guide](PRIVATE_LINK.md), [availability guide](AVAILABILITY.md) and [model guide](MODEL_ARTIFACTS.md) explain their executable boundaries.

The September 14 private QUIC campaign completed registration, heartbeat, inference, signed settlement, readiness payment and unused-fund refund through two real peers on one physical computer. The model request used 62 input and 53 output tokens and completed in 1,997 ms. These measurements refer to the existing GPU-backed local model, not the 32B CPU experiment or a WAN link.

That campaign included 22 real-PostgreSQL tests, three artifact acquisition tests, three private-link tests and five browser journeys, alongside the preserved Rust/Python F0 checks. Browser validation covered the contract lifecycle at desktop and mobile widths. A fresh isolated restore also preserved the balanced journal projection. See the [v0.3 evidence summary](validation-v0.3.json).

No public launch gate is closed merely by these local tests. Cooperative treasury/issuance, a successful mature economic study, independent model-stage admission and metering, adversarial verification, distributed consensus, real payments and an actual funded pilot still require work.

The official Qwen3-32B Q4_K_M artifact was fully acquired and hash-verified. The trusted two-worker CPU experiment allocated model and KV buffers to both workers. A default-repacking comparison matched 2/3 sequences; disabling repacking on both paths matched 3/3. The 32B cluster then completed a real API request through the QUIC link and settled it. [Exact results and limitations](MODEL_ARTIFACTS.md).

## Preserved version 0.2 campaign

This matrix records v0.2 behavior and the local campaign of September 14, 2026. The environment was one physical computer with a shared RTX 4090 and the previously loaded LM Studio model. The project targets models above 27B; this campaign does not qualify their distributed execution.

## Delivered behavior

| Area | Implemented | Boundary |
|---|---|---|
| Interface | Login, real chat, models, sessions, balances, keys, administration, responsive layout | PT-BR; conversation in tab memory; no attachments/tools |
| Identity | Scrypt passwords, personal revocable keys, cookies and account authorization | Private provisioning; no MFA, SSO or email recovery |
| Catalog | Immutable source/license/hash manifests and administrative qualification | Text adapter; no automatic model installation or arbitrary architecture execution |
| Nodes | Persistent Ed25519, one-use invitation, heartbeat, pause/resume and epoch | Loopback; physical inventory and capacity are qualified declarations |
| Admission | Serializable accounting, eligible-account fairness, domain slots, prepare and claim | Single coordinator; administrator-defined domains |
| Inference | Rust gateway/node, streaming, bounded bodies, timeout and cancellation | Real local engine; no integrated WAN or cross-host model parallelism |
| Credits | Integer LAB_TU, hold, experimental 80/20 settlement, refund and idempotency | No cash, withdrawal, cooperative coverage contracts or approved economics |
| Ledger | Balanced journal, protected projections, no runtime-role history editing | Database owner remains trusted; no distributed consensus |
| Failure handling | Epoch fencing, refund, durable outbox and reconciliation | No continuation from the interrupted token; bounded execution window |
| Operations | Checksummed migrations, owned processes, local logs, backup and isolated restore | No public HA deployment, installed Windows service or automatic updates |

## Automated and live evidence

The public [validation report](validation.json) records 18 PostgreSQL integration tests, four Rust runtime tests, two Rust F0 tests, 21 Python F0 tests, and four browser journeys. These counts describe the recorded campaign, not a fresh rerun whenever a document changes.

PostgreSQL integration tests use a separate temporary real database. They cover initial balances, authorization, idempotent grants, journal protection and balance, concurrent holds, account isolation, expiry, shared-domain admission, fairness, replay, single claims, conflicting receipts, inconsistent usage and epoch fencing.

Chromium journeys exercise login, real responses and charges, key creation/revocation, node pause/resume, catalog, logout, 390-pixel mobile layout without page overflow, and rejection of internal proxy routes. Desktop/mobile visual inspection was performed. Automated accessibility found zero violations across the 26 passed rules on the authenticated chat page; this is not complete WCAG certification.

Two real Rust agents shared one physical domain and one slot. Two concurrent requests completed without overlapping execution. The temporary agent used a limited operator profile without database or coordinator authority secrets and was revoked afterward. This remains a same-host result.

The live API campaign checked real usage and signed settlement, retry without a second execution/charge, and cancellation with refund. A node process was interrupted during generation; restart advanced its epoch and the original session terminated without charge. During a separate four-second control outage, the node delivered the stream with a pending receipt, retried its outbox and settled the original session after recovery.

A dump was restored into another database and checked for journal consistency, zero global balance sum, matching projections and runtime-role restrictions. The working database was preserved.

Detailed private reports live under `.runtime/private-lab/`. The public report contains an allowlisted summary without credentials, prompts, answers or private logs. F0 historical artifacts remain a separate campaign.

## Remaining work for the target network

1. **Capacity and links:** different devices and physical hosts, per-stage memory, LAN/WAN/NAT/relay, and integrated qualified transport.
2. **Models above 27B:** broaden quality/context qualification beyond the executed official 32B Q4_K_M profile, then validate distinct-device routes, integrated cross-participant distribution, state and recovery. Official BF16 and Kimi gaps remain as recorded in F0.
3. **Public trust:** independent usage/work verification, adversarial operators, anti-Sybil, exact offer licensing, and appropriate content/privacy policies.
4. **Economics:** fix circulation and coverage, implement the complete elastic and recovery predicates, and evaluate new parameters with fresh holdout seeds and observed costs.
5. **Continuity:** independent operators, federation/consensus, authority rotation, replacement coordinators, and recovery of keys/data on other hosts.
6. **Commercial path:** separate payments, liabilities, seller responsibilities, settlement, disputes and payouts. None is activated here.

Passing local tests does not close these requirements. The [FC01–FC06 register](../execution/GATES.md) governs advancement; [the roadmap](../planning/12_ROADMAP_AND_BACKLOG.md) maps the work.
