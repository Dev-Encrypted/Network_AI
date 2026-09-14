# Private-preview implementation and validation status

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
2. **Models above 27B:** complete larger-model inference, nearby multi-device routes, integrated cross-participant distribution, state and recovery. Official BF16 and Kimi gaps remain as recorded in F0.
3. **Public trust:** independent usage/work verification, adversarial operators, anti-Sybil, exact offer licensing, and appropriate content/privacy policies.
4. **Economics:** fix circulation and coverage, implement the complete elastic and recovery predicates, and evaluate new parameters with fresh holdout seeds and observed costs.
5. **Continuity:** independent operators, federation/consensus, authority rotation, replacement coordinators, and recovery of keys/data on other hosts.
6. **Commercial path:** separate payments, liabilities, seller responsibilities, settlement, disputes and payouts. None is activated here.

Passing local tests does not close these requirements. The [FC01–FC06 register](../execution/GATES.md) governs advancement; [the roadmap](../planning/12_ROADMAP_AND_BACKLOG.md) maps the work.
