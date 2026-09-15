# NETWORK AI contributor

Run one privately invited CPU or NVIDIA CUDA stage with its own worker, protocol guard and authenticated control/data connections. Original code is **Apache-2.0**, original documentation is **CC BY 4.0**, and authorship is attributed to **Dev-Encrypted**. Bundled Zod retains its upstream license.

The contributor does not need a database connection, administrator password, coordinator signing key, root model API key or local copy of the model. The root loads its model's assigned tensors into the worker's memory through the authenticated connection. A participant therefore still needs sufficient RAM, CPU capacity, bandwidth and trust in the paired root.

This is a **private Windows x64 device preview**. The reference engine is llama.cpp **b10964**, commit `b29c606e28a01b1bc8c1351026a0fa6e616bf6c4`. It does not expose a public marketplace or qualify arbitrary hardware and models. The accompanying 32B experiment uses two contributor profiles on one computer. Process/configuration separation on that computer is not operating-system isolation or evidence of two independent providers.

**Device profiles:** the `devices` command reports system RAM and NVIDIA inventory. A new `private_contributor_device` profile selects CPU or one GPU UUID and supplies an observed RPC-buffer budget and reserve. The matching CPU or CUDA engine file set is mandatory. The [device contribution guide](https://github.com/Dev-Encrypted/Network_AI/blob/main/docs/implementation/HETEROGENEOUS_CONTRIBUTORS.md) explains unequal model placement, conservative WDDM memory checks, and their limits. Legacy CPU profiles retain their original behavior.

**Version 0.11:** each contributor now requires a pinned Windows guardian that contains its normal worker/transport descendants in an anonymous kill-on-close job. A supervisor or guardian crash terminates that group. The [containment and upgrade guide](https://github.com/Dev-Encrypted/Network_AI/blob/main/docs/implementation/CONTRIBUTOR_PROCESS_CONTAINMENT.md) explains the operating-system mechanism, tests and limits. The [v0.10.1 status-file correction](https://github.com/Dev-Encrypted/Network_AI/blob/main/docs/implementation/CONTRIBUTOR_STATUS_RECOVERY.md) remains in place.

## What you need

- Node.js 24; the measured installation uses 24.13.0.
- This package, including its bundled `node_modules/zod` when using the packed artifact.
- The complete `bin` directory from the pinned Windows CPU engine for legacy or explicit CPU profiles. CUDA profiles need the separately pinned CUDA engine and runtime archives described in the device guide. The package checks every file's size and SHA-256 against the matching `src/engine-pin.json` or `src/engine-pin.cuda12.json`, including executable and DLL files. Missing, modified or extra files reject startup. Obtain the engine from the [pinned upstream release](https://github.com/ggml-org/llama.cpp/releases/tag/b10964); verify the release independently before trusting it.
- The project's `network-ai-link.exe` and `network-ai-rpc-link.exe`, built with `cargo +1.93.1 build --locked -p network-ai-link` in a reviewed NETWORK AI checkout. Record the exact hashes and put them in the settings. A hash supplied by the same person as an untrusted executable does not establish that executable's provenance. Executable signatures and a production distribution pipeline remain outside this preview.
- The project's `network-ai-contributor-guardian.exe`, built with `cargo +1.93.1 build --locked -p network-ai-contributor-guardian`. Record its hash under `binaries.guardian`. A failed job assignment or missing guardian refuses startup. It is required for this Windows profile; there is no unprotected fallback.
- An invitation for an `RPC_STAGE` node, accepted route terms, the exact route/model manifest hashes and the public identities/addresses of the two peers. The coordinator and root are configured separately.

No contributor command downloads model weights. Legacy profiles explicitly use `--device CPU`; new device profiles use the selected CPU or UUID-bound CUDA device. The startup compute allowance is at most four commands and 256 MiB, expires after ten minutes, and closes permanently on the first ready observation. It is operator-funded initialization, never a paid request.

## Prepare your identity and profile

Run these commands from the extracted package. In a workspace checkout, use `packages/contributor/bin/worker.mjs` instead of `bin/worker.mjs`.

```powershell
node bin/worker.mjs identity --directory C:/NetworkAI/participant
```

This creates two local Ed25519 transport keys and a public `identity.json`. Exchange **only `identity.json`** with the coordinator/root over an authenticated operator channel. Keep `identity.private.json`, the invitation and the resulting `worker.json` private. Node receipt/signature identity is created locally on first startup; existing nodes must preserve their original signing state when migrating.

The two transport identities have different purposes:

| Connection | Paired peer | What crosses it |
|---|---|---|
| Control link | Private coordinator | Node registration, signed heartbeats, readiness declarations, execution claims, receipts, preparation and completion messages |
| Guarded RPC link | Model root | Model weight loading, protocol requests and replies through the local guard |

The operator chooses local ports. The coordinator's registered node address points to its own control-link forward port; that link forwards to this contributor's local guard HTTP port. These two ports need not match. Every address is explicit, relays/discovery are disabled, and all plain HTTP/RPC listeners are restricted to loopback. Only the authenticated QUIC peers may be configured on reachable private addresses. Connectivity across actual hosts has not been qualified by the one-computer campaign.

Copy `examples/settings.windows.json` for the legacy CPU profile, `examples/settings.cpu-budget.windows.json` for an explicit CPU budget, or `examples/settings.cuda.windows.json` for a selected NVIDIA device. Replace every placeholder. These files contain local parameters and public peer/binding information, with no private transport keys. Paths in the settings file are resolved relative to that settings file by `configure`.

```powershell
node bin/worker.mjs configure --directory C:/NetworkAI/participant --invite C:/NetworkAI/invitation.json --settings C:/NetworkAI/settings.json
node bin/worker.mjs check --config C:/NetworkAI/participant/worker.json
```

`configure` uses the participant's own keys. It requires the invitation's public operator information and has no fallback to a coordinator installation. Repeating it preserves identical identity/configuration; changed settings do not overwrite the previous profile. Use a deliberate new profile for key rotation or changed bindings, preserving node signing state and completing pending receipts first. `check` reads the engine and link executables, verifies their hashes and validates the complete profile without starting anything. For a device offer it reports current hardware and `startup_headroom_sufficient` separately: a running worker may already occupy its own budget. A valid profile is not a promise that a second worker can start; `start` enforces fresh headroom.

## Start and stop

The coordinator's control-link process must be listening before the contributor can register. Start contributors before loading the model root:

```powershell
node bin/worker.mjs start --config C:/NetworkAI/participant/worker.json
```

Leave that process running, or use a local service supervisor appropriate to your environment. The supplied managed lab starts it in the background without a visible console. Do not run two supervisors over the same state directory.

The contributor first verifies the installed engine and native binaries, then checks memory headroom for an explicit device offer. Its guardian confirms the current parent PID/boot, exclusive non-inherited job handle and kill-on-close policy before any worker/transport child starts. The contributor then starts the selected worker and control link, registers/resumes its signed node, opens the guard, and starts the RPC link. It reports `WAITING_ROOT` until the root loads the configured model and the contributor receives a current signed declaration. It then reports `READY`.

```powershell
node bin/worker.mjs status --config C:/NetworkAI/participant/worker.json
node bin/worker.mjs stop --config C:/NetworkAI/participant/worker.json
```

`status` reports process IDs, timestamps, current phase and readiness; it does not expose keys. `process_alive` only checks whether the recorded PID exists. `status_fresh` becomes false when the observation is five seconds old, and both `live` and `ready` then become false even if `last_reported_ready` was true. This distinguishes a stale diagnostic snapshot from confirmed current readiness; stale telemetry alone is not evidence that the worker exited.

`stop` reads the current boot from `worker.lock`, so unreadable or stale telemetry does not prevent a graceful request. It does not kill a PID read from an old file. After stopping, verify `STOPPED`, `process_alive: false` and `live: false` once status can be read again. A component failure reports `FAILED`; inspect the private logs before restarting. A dead supervisor's stale lock is recoverable, while an apparently live lock is preserved.

For an existing v0.10 profile, drain work and accepted windows, deliver pending receipts, stop the route, and run `upgrade --config FILE --guardian EXE --guardian-sha256 SHA256`. This checks stopped processes/ports and runtime pins, saves the original private profile, and adds only the guardian entry. `status` and `stop` can still read a legacy profile; `check` and `start` require the guardian. Preserve node signing state and reload the root afterward. Existing guardian pins cannot be silently changed. Update your public settings file with the same entry before using `configure` again.

## How readiness and payment differ

A successful RPC handshake alone is insufficient. The stage sends a fresh random challenge signed with its node identity to the coordinator. The coordinator checks current membership, consent, account status, model and a recent root heartbeat. Its reply is an Ed25519 `NAI-READY` declaration tied to the stage epoch, exact route, model manifest, RPC connection generation and request challenge.

The declaration lasts at most four seconds and cannot extend beyond six seconds after the observed root heartbeat. Both wall-clock and monotonic deadlines gate new preparations. Responses for another stage, route, model, epoch, connection or request are rejected. Expiry closes admission even while another heartbeat is waiting on the network.

Readiness declarations **do not authorize inference or create money**. The existing coordinator-issued execution capability, physical-domain reservation, stage claim and complete-route receipt rules still apply. A new RPC connection invalidates readiness and any prepared work from the old connection. Accepted execution retains its separate bounded deadline; it is not replayed after failure. Credits remain experimental `LAB_TU`, without cash redemption or approved public issuance.

## Failure and privacy boundaries

A status-file replacement denied with `EPERM`, `EBUSY` or `EACCES` degrades telemetry and is retried on later monitor intervals. The old file may remain readable, but its timestamp expires. This treatment applies only after writing a complete temporary snapshot succeeded and cleanup also succeeded. Actual write/encoding/cleanup failures and other replacement errors drain the contributor. Private logs identify `worker_status_degraded`, `worker_status_recovered` or a classified `worker_monitor_failed` without including private paths. A persistent replacement permission problem needs operator attention even while work continues.

The supervisor owns its selected worker and its two transport processes. If one exits, it closes the guard, ends its other children and retains durable pending receipts. If the supervisor or guardian is terminated, the Windows job ends the contributor's normal descendants; a forced crash cannot guarantee a final phase or receipt. The last recorded phase may still say `READY`, so inspect current process/coordinator state. The guardian stays outside the job and is not killed during graceful child cleanup; it closes the job after the parent exits. This does not install a system service or protect the separate root-model/coordinator process trees.

A root model process that has lost a stage must be reloaded together with its route; reconnecting alone does not restore model tensors or replay inference. Follow the coordinator's session/refund and recovery workflow. Startup refuses occupied ports instead of taking over unrelated processes.

Child environments are built from a short OS-variable allowlist. Coordinator configuration variables, database credentials, injected Node options and proxy variables are not inherited. Private state directories receive restricted permissions. These controls do not sandbox the engine or prevent another process running as the same OS user from reading files. Authorized compute peers can see the data they process. Use trusted peers and a private environment: upstream describes this RPC implementation as a prototype, and authentication does not make a malicious authorized root safe. See the [pinned upstream RPC documentation](https://github.com/ggml-org/llama.cpp/blob/b29c606e2/tools/rpc/README.md).

Keep `state/`, private identities, invitations, profile backups, logs and configuration out of public repositories. The package contains no prompt or tensor logger; upstream worker diagnostics remain private. Job containment does not restrict file/network access or isolate OS users, and processes created through another service/broker are outside the tested normal child-creation path. Full RAM/disk/CPU isolation against a hostile paired peer, service installation, multi-GPU engine profiles, cross-host qualification, NAT/relay operation, automatic discovery and public operator admission require additional work.

Detailed architecture, reproducible local campaigns and the remaining launch gates are maintained in the [project documentation](https://github.com/Dev-Encrypted/Network_AI/blob/main/docs/implementation/PORTABLE_CONTRIBUTORS.md).
