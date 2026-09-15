# Installation, operation, and recovery

## Prerequisites and initialization

Run from the repository root with Node.js 24.13.0, pnpm 10.33.0, Rust 1.93.1 and a running Docker installation with Compose. A real compatible inference backend must be prepared separately.

```bash
pnpm install --frozen-lockfile
pnpm lab:init
pnpm lab:start
```

`lab:init` creates the dedicated `network-ai-private-lab` Compose project, PostgreSQL and volume. It generates credentials and cryptographic keys, applies checksum-tracked migrations, and provisions an administrator. Repeating initialization preserves data and identities and does not repeat the bootstrap grant. The administrator receives an explicit 100 `LAB_TU`; new users start at zero.

The profile permits one installation per computer. If another checkout finds the existing project database without its matching private configuration, initialization stops before generating replacement credentials or recreating the container. Restore the original configuration instead of assigning new passwords to an existing volume.

Private material lives in `.runtime/private-lab/`, excluded from Git. Windows initialization restricts the directory ACL to the executing user; Linux uses mode 0700. `credentials.txt` contains initial access details. Keep configuration, dumps, private logs and displayed keys out of public commits.

`lab:start` builds and launches owned background services. After a validated build, `pnpm lab:start --no-build` reuses binaries. To update application code, first run `pnpm lab:stop`, then build and start. Rebuilding Next.js over a running instance's output can invalidate its assets, so startup guards against this condition.

## Local addresses

| Service | Address |
|---|---|
| Interface | `http://127.0.0.1:43100` |
| Control API | `http://127.0.0.1:43101/api/v1` |
| Inference gateway | `http://127.0.0.1:43102/v1` |
| Initial node | `http://127.0.0.1:43103` |
| PostgreSQL | `127.0.0.1:54329` |
| Optional installed 32B CPU node | `http://127.0.0.1:43123` |
| Optional CPU inference backend | `http://127.0.0.1:43220` (private API key required) |
| Optional trusted CPU workers | `127.0.0.1:43820` and `127.0.0.1:43821` (RPC, not HTTP) |

Application listeners and the published database port bind to loopback. Node ports range from 43103 to 43299; choose unused ports and preserve the optional backend's port when enabled. Version 0.3 can connect an invited node through the [private QUIC bridge](PRIVATE_LINK.md) while retaining these local HTTP listeners. Distinct hosts, relays/CGNAT, public admission, adversarial operators and distributed continuity still need qualification. Changing the bind address is not a public deployment procedure.

## Optional authenticated model-stage transport

After installing the measured 32B route, build `network-ai-rpc-link` and run `pnpm lab:route-rpc enable` outside active sessions and accepted readiness windows. This creates two private QUIC pairs and reloads the owned CPU group. Subsequent start/stop commands include those processes. Private status records verify the tracked PID and freshness without probing the model TCP slot. Use `pnpm test:rpc-route --fault` for real inference, interruption/refund and reloaded recovery; `pnpm lab:route-rpc disable` explicitly restores guarded loopback transport. The [full guide](GUARDED_RPC_TRANSPORT.md) explains keys, route bindings, local ports, limits and the remaining cross-host boundary.

## Use the interface

The current interface is PT-BR. The [beginner guide](../GETTING_STARTED.md) maps navigation labels to English.

1. Sign in using the generated private credentials.
2. In Chat, select an available qualified model. Admission holds the maximum charge; settlement charges accepted usage and releases the rest.
3. In Sessions, inspect state, terminal reason, token counts and billing. Past answer bodies are not retained for replay.
4. In API access, create a personal key and save the one-time displayed value. Revocation prevents new authentication with that key.
5. In My nodes, pause or resume new admissions. Previously accepted work may complete. The availability section lets a sponsor fund a bounded readiness offer, its provider accept it, and either party close it with the unused balance returned. See [contract terms and temporary request limits](AVAILABILITY.md).

For a split model, use **Disponibilidade da rota completa** after every participant has accepted and the administrator has qualified the route. Fund one whole-route budget, record the purpose and reason, then have each distinct provider accept the returned terms. The window begins only when every component is freshly ready and every physical domain is unclaimed. [Complete walkthrough and API bodies](ROUTE_AVAILABILITY.md).

Complete-route cancellation differs from standalone cancellation: after activation, escrow and readiness domain claims remain through the fixed deadline to preserve other providers' accepted rights. A provider can relinquish its own future payment; it cannot erase another participant's earned or still-funded interval. A failed route drains automatically. Resume healthy service as appropriate, but do not edit the database to shorten deadlines, remove claims or change accepted prices.
6. In Administration, create users, explicit lab grants, physical domains, invitations and qualifications.

## Register another model or agent

A member can submit an immutable text manifest with model ID, revision, SHA-256, license, HTTPS origin, limits and rates. It enters as `CANDIDATE`. An administrator records evidence and qualifies it as `LOCAL_PREVIEW` after checking the artifact and engine. A different revision needs a different manifest ID.

Submitting a catalog entry does not install a model. The separate `pnpm model:acquire` command downloads explicitly selected, revision-pinned artifacts and verifies their size and SHA-256. Follow the [artifact and CPU cluster guide](MODEL_ARTIFACTS.md) for acquisition, engine preparation, the measured official 32B profile, and optional managed installation. Repository code execution, tools and multimodality are not enabled by a manifest. A whole-model backend or trusted cluster must serve the qualified profile; catalog submission does not partition a model across independent participants.

Create a physical domain for the resource. Agents sharing one GPU should share its domain and measured slot limit. The trusted administrator assigns this topology; the coordinator does not cryptographically prove the physical device.

Create an invitation in the interface for the selected local port. Save its complete JSON response in a private file, including `id`, `invite` and the portable public `operator` section. The latter lets the participant generate a profile without the coordinator's private configuration. Generate a limited operator profile:

```powershell
node scripts/node-config.mjs --invite-file .runtime/invite.json --backend-model "exact-backend-model-id" --port 43104 --backend-url http://127.0.0.1:1235 --backend-kind lmstudio
```

The command prints a new private `config.json` path. This profile excludes database passwords, administrator credentials and the coordinator's private signing authority. Set `NETWORK_AI_CONFIG` to the printed path and launch the agent:

```powershell
$env:NETWORK_AI_CONFIG = "PRIVATE_CONFIG_PATH_PRINTED_BY_THE_COMMAND"
.\target\debug\network-ai-node.exe
```

On Linux, launch `./target/debug/network-ai-node` with the same environment variable. The backend must match the manifest bound to the invitation. One agent serves one configured model and has one local slot. Separate model agents share a physical domain when they compete for the same hardware.

The `lmstudio` adapter checks `loaded_instances`, because `/v1/models` can list unloaded models. The `openai` adapter checks a compatible backend's `/v1/models` declaration; this is not independent proof of residency or measured capacity. Qualify the actual backend before enabling the profile.

The supplied `qwen-local` manifest corresponds to the original station, including its fingerprint and origin/license qualification caveat. Do not assign that hash to different weights. Third-party models and commercial engines do not receive NETWORK AI's license.

## Status, stop, and recovery

```bash
pnpm lab:status
node scripts/lab.mjs restart node
node scripts/lab.mjs restart control
pnpm lab:stop
```

The manager validates owned process commands before stopping their PIDs. Stop retains the database, volume and private configuration. It does not stop other Docker projects. If the optional CPU cluster is installed, `lab:start` waits for its backend and launches its node; `lab:stop` requests graceful shutdown of its supervisor and both workers. Existing external engines, including LM Studio, remain separately managed. A stop/start cycle can take longer because the CPU model's bytes are verified and loaded again.

Version 0.4 can install the [managed complete CPU route](COMPLETE_ROUTES.md#install-the-measured-profile). When present, `cpu-route.json` takes precedence over the retained old CPU profile so the two groups do not load duplicate 32B weights. The manager starts both stage guards before the engine and root. `--skip-cpu` skips this CPU group and leaves any already running group untouched. With v0.12 device recipes installed, combine `--skip-cpu --skip-devices` to start core services without starting either managed model group. Use a full stop/start cycle to recover a failed route as a group; restarting one stage alone invalidates its old session epoch and engine connection.

A restarted node advances its epoch. The control service fences earlier attempts and releases their reservations. The external engine sees a disconnected request; its actual internal resource reclamation depends on that engine.

During a short control outage, the node writes receipts to a durable outbox before sending them. Retried delivery does not charge twice. A write failure blocks new admissions in that process until correction and restart. Execution expires after 180 seconds and queueing after 120 seconds. The current product terminates expired work; it does not resume generation from the last interrupted token.

## Backup and restoration

```bash
pnpm lab:backup
pnpm test:backup
```

Dumps are written under `.runtime/private-lab/backups/`. They contain account records, access hashes and accounting history and must remain private. The verification script restores into a fresh database in this project's PostgreSQL, checks the journal, projection and permissions, then removes that temporary database. It does not overwrite the working database.

Complete recovery also requires protected copies of configuration, authority/node identities and pending outboxes. A database dump alone does not recover Ed25519 keys. Replacing a working database requires stopped services and an explicitly verified destination; initialization does not perform destructive automatic recovery.

## Validate a deployment

Build while managed application services are stopped. Start the application before browser or live acceptance tests.

```bash
pnpm build
pnpm test:integration
pnpm test:unit
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
pnpm lab:start --no-build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:live
pnpm test:faults
pnpm test:outbox
pnpm test:multi-node
pnpm test:link
pnpm test:backup
```

The PostgreSQL integration suite uses a temporary database without a GPU. Full browser, live, fault, outbox and multi-node acceptance require the actual configured model. Fault tests restart only the named project service; run them without unrelated user sessions in progress. CI exercises integration and the browser journeys that do not require a model engine.

Read [validation scope](STATUS.md) before interpreting a passing command as hardware, WAN, economic or public-operation qualification.

## Upgrading readiness contracts

Version 0.5 requires migration 006. Back up first, finish funded windows when practical, stop the managed application, run `pnpm lab:init` to apply checksummed migrations, then rebuild/start normally. Initialization refuses to run while the configured control port is listening, so an older coordinator cannot accept leases during the claim-registry upgrade. Existing standalone active claims are imported into the shared readiness registry. Accepted standalone terms retain their previous cancellation policy. Roots and stages cannot create new standalone offers.

Reconciliation preserves funded windows across restarts, but unobserved gaps over six seconds are not extrapolated into compensation. After a restart, inspect the window's state, per-component observed time, escrow and refund events. `pnpm test:backup` restores into another database and verifies route-readiness tables, individual/total budget projections, escrow and runtime permissions. The dump and source comparison share an exported PostgreSQL snapshot, so concurrent new payments are not mistaken for missing restored entries. The working database is preserved.

With the managed 32B route already installed, `pnpm test:route-availability --fault` exercises an actual 30-second funded window, one bounded stage pause, recovery and real inference using that same model copy. It spends at most 0.030 LAB_TU on readiness plus the separately quoted request charge. Use a domain without another active readiness window. This campaign's evidence is local control behavior, not independent hardware or economic qualification.


## Cooperative preview upgrade and acceptance

Version 0.6 adds migration 007. Preserve a backup, let accepted windows finish when practical, stop the managed control/interface before initialization, then run `pnpm lab:init`, `pnpm build` and `pnpm lab:start --no-build`. Previously applied migrations are checksummed; never edit them in place. A paused cooperative plan preserves funds and accepted windows. Reaffirming operational support permits new windows without changing old accepted deadlines.

With the managed official 32B route already installed, `pnpm test:cooperative` runs two bounded 30-second windows and one real inference. It commits only 3,000 existing microcredits to initial working capital; it issues no grants and downloads no model. Consumed credits are recycled into the same plan to fund the next window. The plan is paused afterward; its remaining credits remain committed to that plan. Reports are private under `.runtime/private-lab/cooperative-campaigns/`. Use the interface's **Cooperação** view to inspect or explicitly resume it. [Full fund lifecycle](COOPERATIVE_FUNDS.md).

`pnpm test:backup` now verifies cooperative table counts, original session/window/policy references and restored ledger projections against the dump's exported snapshot. Restore failures never overwrite the working database. The public release publishes only allowlisted summaries, not private backups or configuration.

## Bounded automatic renewal

Version 0.7 adds migration 008. Back up, pause new commitments, preserve accepted obligations and stop the managed control/interface before applying it with `pnpm lab:init`. Then build and restart using the same managed flow. Applied migrations remain byte-for-byte checksummed. Never reset a permission's used counters, edit a recorded limit or change expiry through SQL. Revoke and replace a permission through the authenticated API when new authority is intended.

The **Cooperação** view exposes separate finite fund authorizations and provider mandates. Creating one does not reserve future funds or start extra engines. Reconciliation funds a window only when current free funds, complete readiness, all mandates, source limits and support deadlines permit. Pause blocks new commitments; revocation affects future windows. An already accepted window keeps its original term and can continue paying observed readiness.

With the managed 32B route running and existing credit available, `pnpm test:renewal` runs the actual automatic lifecycle described in [the renewal guide](BOUNDED_RENEWALS.md). It authorizes at most three 30-second windows and 9,000 gross working microcredits, contributes 3,000, uses one real inference, then revokes future participation during the second window. It observes the second window's completion, verifies no third window, revokes remaining authority and pauses the pool. Remaining fund credits stay committed; no new grant or model download occurs.

`pnpm test:backup` additionally compares renewal and mandate table counts, durable usage/counter projections, accepted-window bindings and restricted write permissions. This is an isolated restore into a fresh database using the same exported snapshot as the dump. It does not replace the working database or launch another coordinator. Private reports remain under `.runtime/private-lab/`; public evidence is separately allowlisted.

## Demand-backed expansion

Version 0.8 adds migration 009. Preserve the exact bytes of previously applied migrations 001–008. Back up the working database, allow accepted work to finish where practical, and stop the owned control/interface processes before initialization and rebuilding. Run `pnpm lab:init`, `pnpm build`, then `pnpm lab:start --no-build`; on the original host, `--skip-cpu` preserves an already running managed model group. Never rebuild the interface's `.next` directory under its live server. This upgrade adds declarations and mode-aware permissions; it does not rewrite historical policies, balances or accepted terms.

New v2 plans permit optional separately authorized expansion. Old plans remain essential-only. Register truthful private classifications and operational support in the interface, then create finite expansion manager/provider permissions as described in [the full guide](DEMAND_BACKED_EXPANSION.md). The status panel reports missing recovery, funds, reserve, evidence, pressure or capacity. A valid permission alone does not open a window.

`pnpm test:expansion` uses the already installed official 32B route and commits 3,000 existing microcredits to one essential 30-second window. It records actual one-host in-kind support, creates separate bounded essential/expansion permissions, completes a real cooperative request and proves that self-use does not qualify independent expansion. It changes no hardware observations, ownership classifications or historical clocks; creates no grant; downloads no model; and leaves the campaign paused with permissions/support revoked. Remaining fund credits stay committed. Reports remain private under `.runtime/private-lab/expansion-campaigns/`.

`pnpm test:integration` tests successful expansion using explicitly fabricated private declarations, domains and chronology in temporary `network_ai_test_*` databases. Its restore case dumps one such database into a separately created restore database, preserving positive demand claims and active contracts. The helper `scripts/verify-backup.mjs --source-test-database <generated-test-database>` accepts only the exact test-database name pattern; normal `pnpm test:backup` continues to use the working lab. Neither command overwrites its source. Dumps and raw reports must stay private.

Restore verification now checks the four new tables, coverage kinds, demand and support references, lifetime counters, escrow projections and denied history/term writes. A working snapshot with zero expansions is expected on an unqualified one-host profile; its success does not substitute for the positive isolated fixture restore. Neither establishes a second physical host or public economic qualification.

## Portable contributors

Version 0.10 adds no database migration. Deploy/restart the control service so it serves the node-signed readiness endpoint, build the transport binaries, and follow [portable contributor installation](PORTABLE_CONTRIBUTORS.md). `pnpm lab:route-contributors enable` configures the already installed route with two contributor-owned workers, separate control/RPC peers and no backend API keys in their profiles. It preserves the original stage signing identities, route, model copy, account and physical domain. It refuses active sessions/windows and pending old receipts before the transition.

Version 0.10.1 corrects the contributor supervisor's handling of Windows status-file locks and stale telemetry. It also needs no migration, engine replacement or key rotation. Drain accepted work and windows before restarting the route with the corrected source, preserving node identity and receipts. Follow the [diagnosis, status-field semantics and upgrade procedure](CONTRIBUTOR_STATUS_RECOVERY.md).

`pnpm test:contributors` runs real 32B requests, concurrency and owned child-failure/recovery checks on the selected portable profile. It spends only existing LAB_TU. `pnpm contributor:pack` builds and extracts a standalone source archive with Zod and licenses, then runs its CLI and identity command. Model weights, native executables, private credentials and raw logs are excluded.

Graceful shutdown requests target the contributor's current boot; only verified owned processes are used for fault injection. After control-link or worker loss, inspect terminal sessions and pending receipts before full model/route reload. Version 0.11 requires a pinned Windows job guardian for the contributor process tree. Build `network-ai-contributor-guardian`, then use `pnpm lab:route-contributors upgrade` on the existing portable route after commitments drain. This retains the current transport binaries, keys and model. A forced crash may leave the last status phase unchanged even after all protected processes are gone. Follow the [containment and recovery guide](CONTRIBUTOR_PROCESS_CONTAINMENT.md); root-model/service supervision and resource isolation remain separate requirements.

## Mixed CPU/CUDA device recipes

Version 0.12 adds explicit device profiles, observed RPC allocation budgets and unequal layer placement. It adds migration 010, which retains immutable model definitions while allowing qualification changes. For an existing checkout, finish accepted work, take a backup, stop the application, install the locked dependencies, then run `pnpm lab:init` and `pnpm lab:start`. Existing initialization does not repeat the initial grant. Applied migration files must keep their original bytes.

Follow the [device guide](HETEROGENEOUS_CONTRIBUTORS.md) to verify both engine packages, choose measured budgets and fill the complete recipe. `pnpm lab:device-route install --recipe FILE` uses existing owned resource domains. It creates a distinct model/route definition and retains resumable private identities. Ordinary `lab:start` includes successfully installed recipes; `lab:stop` cleans their tracked components, including partial installations. `pnpm lab:device-route stop --id ID` and `start --id ID` operate on the selected route without restarting the original CPU route or LM Studio model.

`pnpm test:devices --id ID` sends three actual mixed-route requests and verifies signed settlement, concurrent serialization and buffer budgets. Optional `--competing-gpu-model MODEL_ID` and `--competing-cpu-model MODEL_ID` exercise existing models sharing its domains. `--fault` terminates the owned CUDA worker during another request, checks refund/claim release, then reloads the same route. These commands spend existing LAB_TU and deliberately affect the selected route; finish other accepted work first. The current installer and reported campaign use one physical Windows computer. Their results do not establish independent providers or hardware compatibility beyond the measured devices.
