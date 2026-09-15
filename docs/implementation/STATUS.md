# Private-preview implementation and validation status

## Version 0.10.1 correction

The contributor monitor now separates diagnostic-file replacement failures from execution failures and reads its in-process guard health without a self-HTTP timeout. A stale status snapshot cannot report current readiness. Graceful stop uses the current lock boot even when telemetry cannot be read. Actual write/cleanup errors and tracked child exits still drain the contributor. [Behavior, cause limits and upgrade instructions](CONTRIBUTOR_STATUS_RECOVERY.md).

A controlled read lock reproduced a supervisor shutdown in the original v0.10 code while waiting for the root. The first later `worker_health_failed` shutdown had insufficient logging to establish its particular cause. With the correction, a **real 32B request continued through a 9,038 ms Windows status-file lock**, preserving the supervisor boot and all children. The request settled 23 input/128 output tokens, three receipts and 407,000 micro-LAB_TU with no extra grant or projection mismatch. This is a one-host CPU reliability result. [Live evidence](evidence/qwen3-32b-contributor-status-v0.10.1.json), [versioned validation](validation-v0.10.1.json).

All **160 distinct automated cases** passed locally for this patch: 94 integration, 21 Node unit/socket, 14 Rust, 21 Python F0 and ten browser journeys. Type checking, application build, Rust formatting and Clippy passed. The [isolated working-database restore](evidence/contributor-backup-restore-v0.10.1.json) preserved 496 journals, balanced projections and runtime permissions. The [extracted source package](evidence/contributor-package-v0.10.1.json) validated both installed profiles; both supervisors and the root were ready during the final check. No applied migration or preserved F0 source changed. The previous v0.10 measurements below remain historical records.

## Version 0.10 additions

The [portable contributor package](PORTABLE_CONTRIBUTORS.md) supervises a participant's pinned Windows CPU worker, stage guard and both authenticated transport peers. It has strict private profiles, participant-generated keys, local binary verification, a filtered child environment, persistent node identity, current-boot shutdown and whole-contributor cleanup after an owned child fails. Short-lived coordinator-signed readiness declarations replace root-backend credential polling in this mode. They bind the exact stage epoch, route/model, RPC generation and request challenge; they do not authorize execution or mint credits. The root model server uses externally supervised workers.

The real one-computer campaign completed **five 32B requests**, each with 18 input/six output tokens, three accepted receipts and a conserved 36,000-micro-LAB_TU charge. Concurrent consumers did not overlap the one physical slot. An owned contributor control-link failure during execution produced `FAILED / REFUNDED` with zero charge and no retained physical claim in 17,482 ms; a worker failure did the same in 1,655 ms. The contributor reached `FAILED` and group reload restored actual inference after each fault. No additional grant, model copy, node/provider identity or GPU takeover was used. [Measured campaign and limits](evidence/qwen3-32b-portable-contributors.json).

The source archive includes its exact Zod dependency and applicable licenses. Its extraction and standalone CLI/identity startup are verified separately from model execution. Engine and transport binaries, Node, weights and private state are separate prerequisites. The packaged code does not import the coordinator source/configuration. Same-user processes can still access the host's files: this is process/configuration separation, not an OS sandbox. Forced supervisor termination can leave children; service/job ownership and hostile-peer resource limits remain open.

Validation passed **94 integration cases, 16 Node unit/socket cases, 14 Rust cases, 21 unchanged Python F0 cases and ten browser journeys: 155 distinct automated cases**. The browser suite ran against the installed contributor route. An isolated working-database restore preserved 455 journals, balanced projections and runtime permissions. [Versioned validation](validation-v0.10.json), [restore evidence](evidence/contributor-backup-restore.json), [source package and SHA-256](evidence/contributor-package.json). Applied migrations 001–009 and all preserved F0 artifacts retain their exact bytes. Physical-host/GPU/WAN qualification, independent verification, a successful economic study, public issuance, distributed continuity and cash settlement remain unfinished.

## Preserved version 0.9 campaign

The [guarded RPC transport](GUARDED_RPC_TRANSPORT.md) carries actual model-stage bytes over paired Iroh/QUIC endpoints. It uses a dedicated ALPN, pinned identities, exact stage/route/manifest bindings, bounded handshakes, one active tunnel, streaming backpressure and finite link failure detection. The worker-side guard remains responsible for claimed compute, deadlines and durable receipts, and now also rejects signed capabilities that differ from the configured transport binding. The installed CPU route has managed enable/disable, start/stop, private status and recovery commands.

On September 15, the existing Qwen3-32B Q4_K_M completed four requests through two real QUIC pairs. Every request had 18 input and six output tokens, three accepted receipts and a conserved 36,000-micro-LAB_TU charge. The concurrent pair did not overlap the single physical domain. Terminating only the second stage's QUIC process during another request produced `FAILED / REFUNDED`, zero charge and zero retained physical claims; detection took 2,098 ms. A complete group restart and model reload restored actual inference. No new grants, operator/node identities, GPU takeover or second model download were used. [Recorded campaign and measurement limitations](evidence/qwen3-32b-rpc-quic.json).

Validation includes 91 integration cases, nine Node unit/socket cases, 14 Rust cases, 21 unchanged Python F0 cases and ten browser journeys: 145 distinct automated cases. Five new Rust cases test actual transport behavior; two new Node cases test private configuration and the real stage capability handler. The full browser suite runs on the installed QUIC profile. An isolated working-database restore preserved 364 journals, projections and runtime permissions. [Version 0.9 report](validation-v0.9.json), [restore evidence](evidence/rpc-quic-backup-restore.json).

The managed adapter and all reported inference still use one Windows computer, one operator account, one CPU/RAM domain and one slot. Cross-host worker supervision/readiness, heterogeneous GPU placement, WAN/NAT/relay qualification, engine isolation against an authorized malicious peer and independent numerical/work verification remain open. This transport increment does not approve public issuance, the proposed economy, distributed consensus or paid operation. Applied migrations 001–009 and all preserved F0 artifacts retain their exact bytes.

## Version 0.8 additions

The private controller now opens optional complete-route expansion only under explicit new-plan terms, separate bounded manager/provider permissions, stable recovery, a preserved essential floor, full protected reserve, recorded operating support, covered essential groups, sponsor headroom, qualifying retained flow and current funded pressure beyond covered free slots. Economic parties and time-bounded account affiliations are administrator-reviewed declarations with immutable provenance. Unknown or affiliated users do not justify expansion; later classifications cannot qualify prior consumption. Each selected request can justify expansion once. Activation, escrow, demand evidence and used permissions are atomic. [Detailed explanation and API](DEMAND_BACKED_EXPANSION.md).

The actual one-host 32B CPU campaign funded one essential 30-second window with 3,000 existing microcredits. A 19-input/seven-output-token request completed in 4,054 ms and recycled 40,000 microcredits. The window paid 3,000. Expansion remained at zero windows/zero commitment despite separate permissions and recorded local support: self-use was not qualifying independent flow, no second physical route existed, and reserve/recovery conditions were unmet. No grants or fabricated clock/party observations were used. [Real report](evidence/qwen3-32b-expansion-gates.json).

Validation includes 91 integration/accounting cases, of which 17 exercise the new expansion behavior, seven unit/socket cases, nine Rust cases, 21 unchanged Python F0 cases and ten browser journeys. The browser campaign passed all ten journeys in one run, including support-response retry, explicit expansion consent, zero reserve authority, waiting explanations, revocation and 390-pixel layout. An isolated fixture restore contained seven positive expansion claims and two active whole-route windows; a separate working snapshot correctly contained none. Both preserved projections, contract bindings and restricted runtime permissions. [Version 0.8 report](validation-v0.8.json), [fixture restore](evidence/expansion-fixture-restore.json), [working restore](evidence/expansion-backup-restore.json).

This completes the private expansion mechanism, not the public economic controller. Real 24-hour recovery, independent ownership/work verification, observed cost calibration, a fresh successful mature economic study, issuance/exposure governance, heterogeneous multi-host GPU/WAN routes, distributed continuity, cash settlement and a funded public pilot remain open. The original F0 evidence and failed configurations remain unchanged. Old pool policies retain essential-only behavior; new plans explicitly permit separate private expansion authorization.

## Preserved version 0.7 campaign

The private coordinator now renews whole-route readiness automatically within two independent permissions: finite manager authority over gross working/reserve commitments, and finite provider mandates over their exact route participation. Activation, escrow, participant consent, physical claims and used limits commit atomically. Returned escrow never replenishes a permission. Pauses, absent consent, unavailable capacity, insufficient funds, source restrictions or expiry prevent new commitments. Revocation preserves accepted windows. The interface shows limits, consumed authority, waiting reasons and revocation controls. [Complete contract and operations guide](BOUNDED_RENEWALS.md).

The installed 32B CPU campaign used one host, one account and three signed agents. A 3,000-microcredit contribution funded the first automatic 30-second window. A real request used 19 input and seven output tokens, settled 40,000 microcredits and recycled them into the fund. The second window started automatically without another contribution or grant. Both windows paid 3,000; revocation during the second preserved subsequent readiness payments but prevented a third despite available funds, ready capacity and one unused authorized window. Final free working capital was 37,000, with no held balance. [Allowlisted result](evidence/qwen3-32b-bounded-renewal.json).

Validation includes 74 integration/accounting cases (14 specific to renewal), seven unit/socket cases, nine Rust cases, 21 unchanged Python F0 cases and nine browser journeys: 120 distinct automated cases. The prior eight browser journeys passed in the full run; the new journey passed after correcting its select locator. Its controls were inspected at desktop and 390-pixel mobile widths. An isolated restore of a snapshot containing 293 journal entries and one active complete-route window preserved renewal projections, bindings and runtime-role restrictions. [Version 0.7 validation](validation-v0.7.json), [restore result](evidence/renewal-backup-restore.json).

That release closed the private bounded-renewal mechanism. Its then-outstanding private expansion work is covered by v0.8 above; independent operators, heterogeneous GPU/WAN routes, public verification/consensus, economic qualification, issuance and cash settlement remain unfinished. An active mandate does not guarantee gap-free service: the next window is funded after the prior one ends. The original F0 source hashes and unsuccessful economic studies remain unchanged.

## Preserved version 0.6 campaign

The private application now implements immutable essential coverage plans, existing-credit contributions, separate working/reserve/burn accounts, protected essential contingency incidents, readiness-only provider consent and cooperative quote/session binding. Verified consumption replenishes the working floor, reserve and working target in order. An exactly backed full refund reverses the original destinations once; it cannot spend another contract's escrow or mint a replacement. The interface exposes these operations and the consumer's explicit choice. [Contracts and arithmetic](COOPERATIVE_FUNDS.md).

The actual installed 32B CPU route completed a two-window cycle using one computer and one operator account. An initial 3,000-microcredit contribution funded the first 30-second window. A request used 18 input and eight output tokens and recycled its 42,000-microcredit charge into working capital. That consumption funded the second window without another contribution or grant. Both windows paid exactly 3,000 microcredits, released their physical-domain claim and left 39,000 in working capital. The campaign remained in `RECOVERY`, then paused new promises. [Allowlisted report](evidence/qwen3-32b-cooperative-cycle.json).

Automated coverage includes 60 integration/accounting cases, seven unit/socket tests, nine Rust tests and 21 preserved Python F0 tests. The browser adds a cooperative plan, lost funding response retry, explicit provider consent and selected-pool chat journey to the previous seven. Snapshot restoration includes cooperative records and projections. [Version 0.6 validation](validation-v0.6.json).

This closes a private circulation mechanism, not the entire economic controller. The 24-hour state transition is tested with an isolated database clock; there is no real 24-hour healthy campaign or successful 30-day mature study. Demand-backed expansion, observed cost calibration, qualified issuance, diverse operators, public verification/quorum, cross-host execution and paid-market settlement remain open. All previous F0 failures retain their original status.

## Preserved version 0.5 campaign

Complete-route readiness now has one pre-funded budget, immutable per-component maximums, exact-term acceptance by every distinct provider, shared-domain exclusion across both readiness APIs, and fixed-window draining. A failed or withdrawing stage stops earning its own future entitlement; eligible peers preserve their accepted obligations. Remaining escrow is returned to the sponsor at the fixed end. The PT-BR interface exposes funding, consent, component payments, joint-ready time and closure. This compensation is explicitly additional to normal inference settlement.

The September 14 local campaign used the already-installed official 32B CPU route and actual signed agents. A 30-second window paid 25,483 micro-LAB_TU and refunded 4,517. An API pause stopped one stage's readiness earnings while its peers continued earning. After resumption, a real inference completed with 18 input and seven output tokens and separately settled 39,000 microcredits. No new grant, model copy or cash transfer was used. [Exact terms and evidence](ROUTE_AVAILABILITY.md), [allowlisted report](evidence/qwen3-32b-route-availability.json).

Coverage adds 13 real-PostgreSQL cases to the previous 34 and a seventh browser journey, including a lost funding response retried without a duplicate hold. Readiness escrow, component projections, domain claims and restricted permissions are included in isolated backup restoration. [Version 0.5 validation](validation-v0.5.json). As with v0.4, the actual model evidence uses one account and one physical host. At that release, common-fund circulation, the candidate reserve/issuance controller, independent verification and a successful economic study were unfinished; the v0.6 section above records the new private circulation boundary.

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
4. **Economics:** qualify private circulation, coverage and demand-backed expansion with independent evidence; implement approved issuance/exposure governance and evaluate new parameters with fresh holdout seeds and observed costs.
5. **Continuity:** independent operators, federation/consensus, authority rotation, replacement coordinators, and recovery of keys/data on other hosts.
6. **Commercial path:** separate payments, liabilities, seller responsibilities, settlement, disputes and payouts. None is activated here.

Passing local tests does not close these requirements. The [FC01–FC06 register](../execution/GATES.md) governs advancement; [the roadmap](../planning/12_ROADMAP_AND_BACKLOG.md) maps the work.
