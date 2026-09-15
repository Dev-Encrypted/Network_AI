# Contributor status recovery in v0.10.1

This page preserves the v0.10.1 correction and its measured evidence. [Version 0.11](CONTRIBUTOR_PROCESS_CONTAINMENT.md) subsequently adds required Windows contributor process containment. Use the current package/upgrade instructions for a new installation; the historical limitations below describe v0.10.1.

Version 0.10.1 fixes a Windows contributor failure in which a reader holding the status file could terminate a healthy worker. It also removes an unnecessary HTTP request from the supervisor to its own guard. This is a reliability correction to the private contributor preview; the accounting, model bindings and execution authorization rules are unchanged.

## What happened and what is known

After the v0.10 release campaign had passed, a later installation check found the second contributor stopped with `worker_health_failed`. The old monitor used that label for several different errors and did not preserve the original cause. That particular shutdown cannot be conclusively attributed to a file lock or a network timeout.

A separate, controlled reproduction established a concrete defect in the published v0.10 code: holding `worker-status.json` open for reading with Windows `FileShare.Read` for 1,200 ms stopped the owned supervisor. That flag permits other readers but denies replacement of the file. This reproduction was performed while the contributor was waiting for its root, without an inference request. The [old-code reproduction record](evidence/contributor-status-reproduction-v0.10.json) preserves that narrower scope.

The previous monitor combined stop-request reading, a one-second loopback HTTP health request and status writing under one failure handler. Consequently, a diagnostic-file problem or a delayed self-request could be classified as worker failure. The root and its other stage then needed coordinated recovery, even though the CPU worker had not necessarily failed.

## How the corrected supervisor behaves

| Observation | Behavior in v0.10.1 |
|---|---|
| Status JSON is written successfully | Publish one complete document, then replace the previous status atomically |
| Replacement returns `EPERM`, `EBUSY` or `EACCES` | Retry the replacement nine times at 25 ms intervals after the first attempt; clean up the temporary file, record degradation and retry on a later monitor interval |
| A reader holds the status file for longer | Keep healthy execution running; mark the old diagnostic snapshot stale after five seconds |
| The replacement succeeds again | Publish fresh status and emit one recovery event |
| Encoding, writing or cleanup fails, or replacement fails for another reason | Emit a classified monitor failure and drain the contributor |
| A tracked worker or transport child exits | Close the guard and drain the other owned children, as before |
| The operator requests a graceful stop | Read the current `worker.lock` boot and write an atomic stop request for that boot; stale or unreadable status is not required |

Each status attempt has a bounded number of retries and uses one unique temporary file in the same private directory. Failed attempts remove that file; cleanup failure is itself fatal. A persistent replacement permission error can continue to degrade telemetry. The error code cannot by itself distinguish a viewer's sharing lock from every possible permission problem. Only the replacement step receives this treatment, after writing the new snapshot succeeded. This is not a general instruction to ignore storage errors.

The guard is part of the supervisor process. The monitor now reads the same in-process health object used by the guard's HTTP endpoint, avoiding the self-HTTP timeout. The snapshot still depends on the guard's listening sockets, RPC connection and current signed readiness declaration. An actual child exit, expired declaration, broken connection or failed execution claim retains its existing effect.

Diagnostic status does not grant the authority to run or charge for a request. Signed capabilities, fresh readiness declarations, physical-slot admission and receipt-dependent settlement remain separate controls. If the Node event loop stalls, this change does not extend a signed deadline.

## Reading status and stopping a contributor

The `status` command reports these additional fields:

- `process_alive`: whether the PID in the snapshot currently exists; this alone does not prove identity, readiness or health.
- `status_fresh`: whether the observation timestamp is within five seconds of the current time.
- `last_reported_ready`: the old document's readiness bit, retained for diagnosis.
- `ready`: true only for a fresh `READY` snapshot with a live PID and a recorded ready bit.
- `live`: true only for a fresh snapshot with a live PID in `STARTING`, `WAITING_ROOT` or `READY`.

For example, a read lock may produce `process_alive: true`, `status_fresh: false`, `last_reported_ready: true`, `ready: false` and `live: false`. That result means the status command cannot confirm current readiness. It does not mean the supervisor has exited. Inspect the classified private logs and current guard/coordinator observations before deciding whether recovery is needed. The first degradation event contains only an error code and operation; it does not include private paths or the original exception text.

`stop` validates a positive live PID and a boot UUID from `worker.lock`, then writes a request for that boot. It never sends an OS kill signal to a PID from the status file. The supervisor processes only a stop request matching its own boot. If it is no longer running, inspect component ownership before cleanup; this patch does not install a Windows Job Object or service manager.

## Actual 32B verification

The [corrected-code campaign](evidence/qwen3-32b-contributor-status-v0.10.1.json) ran a real request through the installed official Qwen3-32B route. It locked the second contributor's status file for a requested nine seconds while the session was `RUNNING`. No model output was retained in the published evidence.

| Measurement | Observed result |
|---|---|
| File lock duration measured by the harness | 9,038 ms |
| Status after 5.6 seconds of locking | Stale; did not claim live/ready |
| Guard during stale telemetry | Ready; session still running |
| Supervisor and children | Same boot and PIDs before and after the lock |
| Final session | `COMPLETED / SETTLED`, 23 input tokens and 128 output tokens |
| Accepted receipts | One root receipt and two stage receipts with observed compute |
| Charge | 407,000 micro-LAB_TU |
| Provider compensation / working-account fee | 325,600 / 81,400 micro-LAB_TU under the existing 80/20 terms |
| Additional grants / ledger projection mismatches | 0 / 0 |

The experiment used **one Windows computer, one operator account and one CPU resource domain**. Its three agent receipts do not establish three independent providers. It establishes recovery from this controlled Windows telemetry fault during actual inference, not WAN reliability, GPU compatibility, public economic viability or operating-system isolation. The [versioned validation record](validation-v0.10.1.json) separates the live campaign from automated fixtures and the preserved v0.10 evidence.

## Reproduce or upgrade

On the already installed private Windows lab, with the contributor route ready and no active sessions or accepted readiness windows:

```powershell
pnpm test:contributor-state
```

This deliberately locks only the managed second contributor's status file, creates a temporary API key, sends one metered request and revokes the key afterward. It spends existing laboratory credits; it does not fabricate receipts, create grants, download a model or select a GPU. The command refuses a non-Windows environment or an installation without portable contributor supervision. Private output remains under `.runtime/`.

To upgrade a standalone installation, wait for accepted work and windows to finish, stop the whole route through the owning coordinator's recovery workflow, and replace the contributor source/package with v0.10.1. Preserve private profiles, invitations, node signing state, transport keys and pending receipts. Run `check`, start contributors and reload the root model. The package commands and prerequisites remain in the [participant manual](../../packages/contributor/README.md). The managed demonstration can use `pnpm lab:stop` followed by `pnpm lab:start` after updating the checkout. This restarts managed services; it does not remove the database or require a migration.

The original v0.10 tag, source archive and evidence remain preserved. Prefer the v0.10.1 package for new installations. Additional work still includes forced-supervisor termination containment, OS resource limits, independent hardware and operators, and the public network/economic qualification described in the [status matrix](STATUS.md).
