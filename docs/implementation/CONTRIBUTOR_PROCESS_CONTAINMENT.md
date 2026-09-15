# Windows contributor process containment

Version 0.11 adds a native guardian for each Windows CPU contributor. If the contributor supervisor crashes or is terminated by the operating system, its ordinary worker and transport descendants are terminated too. A guardian crash also terminates that contributor group. This closes the known orphan-process gap in the portable contributor lifecycle. It does not create an operating-system security sandbox or qualify public operators.

The project still prioritizes models above 27B. Containment protects the lifecycle of a contributing process tree; it does not reduce a model's memory requirement, add physical capacity, or establish that different GPUs can execute the same route.

## Why another process is needed

JavaScript cleanup runs only while the supervisor can execute it. An OS termination can bypass its `finally` blocks, receipt-flush attempt and child-exit handlers. A CPU worker or transport left running may retain memory, ports and a broken connection. Restarting another supervisor over that state must not silently take ownership of the leftovers.

The native guardian holds an anonymous Windows Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. Windows ends the associated processes when the final job handle closes. Normal `CreateProcess` children inherit the job; this implementation enables neither breakaway flag. Job nesting has OS constraints, so assignment is checked and failure refuses startup. See Microsoft's [job object lifecycle](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects) and [process assignment requirements](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-assignprocesstojobobject).

The guardian starts before the contributor launches any worker or transport. It remains outside the new job and waits on a handle to its actual parent. A parent exit closes the guardian's sole job handle. A guardian termination also closes that handle through the OS. There is no shared named job that one participant could accidentally reuse for another participant.

## Startup and shutdown contract

1. The contributor checks its strict profile, complete pinned CPU engine and all three native binary hashes: control link, RPC link and guardian.
2. It creates its current-boot lock and verifies its local ports are free.
3. It launches the pinned guardian with its PID and boot UUID through a filtered environment and hidden process.
4. The guardian compares the requested PID with its actual parent from the Windows process snapshot. It opens a live process handle and checks creation time, preventing a newly reused parent PID from becoming the target.
5. It creates a non-inheritable, anonymous job handle, sets kill-on-close, assigns the parent and verifies both membership and flags. The guardian itself must remain outside that job.
6. It returns one bounded JSON acknowledgement bound to the parent PID, guardian PID and boot UUID. The contributor waits up to five seconds for that acknowledgement. No inference or transport child starts before confirmation.
7. The contributor starts its CPU worker, guard and transport children as before. Signed readiness, execution capabilities, physical admission and receipt settlement retain their existing rules.

The guardian is deliberately excluded from the supervisor's graceful child-stop list. Killing it during ordinary shutdown would terminate the parent before it could finish its own cleanup. Graceful shutdown instead drains the worker/transports, publishes the final status, releases the lock and lets the parent exit. The guardian then closes the job. Its Node child-process and pipe handles do not keep the supervisor alive indefinitely; the CLI also detaches its stdin/signal listeners after shutdown completes.

An unexpected guardian exit is a hard contributor failure. It cannot be silently replaced while the old group continues. Recover through whole-route reload and normal session/refund handling.

## State and accounting after a crash

Fresh `worker-status.json` includes a `containment` object with the current guardian/parent IDs, boot binding and confirmed flags. These fields describe local lifecycle protection. They are not payment evidence, proof of work or proof that an operator owns an independent computer.

After a forced crash, the last status document may still say `READY`: the terminated process cannot publish a final phase. Check `process_alive`, `status_fresh` and `live`, then current coordinator/session state. Never turn an old local phase into a new accepted receipt. The [v0.10.1 telemetry rules](CONTRIBUTOR_STATUS_RECOVERY.md) still apply.

The coordinator and gateway retain responsibility for terminating failed sessions, releasing physical claims and resolving their laboratory-credit reservations. Already durable outbox receipts are preserved. Containment does not guarantee a final receipt from a process killed during execution and does not replay inference. The root model must reload its tensors after losing a stage.

## Install or upgrade

Build the guardian from the reviewed checkout:

```powershell
cargo +1.93.1 build --locked -p network-ai-contributor-guardian
pnpm test:guardian
```

The participant package includes source and its JavaScript dependency, not this compiled executable. Add `binaries.guardian.path` and `binaries.guardian.sha256` to the [public settings example](../../packages/contributor/examples/settings.windows.json). Obtain and verify the native executable through the same deliberate operator process as the transport binaries. The package verifies the supplied hash; that alone does not establish the provenance of an untrusted executable.

Legacy profiles remain readable by `status` and `stop`. A new `start` or `check` refuses a profile without a pinned guardian (`worker_guardian_required`), and new `configure` input requires it. There is no automatic unprotected fallback.

For a stopped standalone contributor, with accepted work/windows finished and pending receipts delivered:

```powershell
node bin/worker.mjs upgrade --config C:/NetworkAI/participant/worker.json --guardian C:/NetworkAI/bin/network-ai-contributor-guardian.exe --guardian-sha256 REPLACE_WITH_VERIFIED_SHA256
node bin/worker.mjs check --config C:/NetworkAI/participant/worker.json
```

`upgrade` refuses a live supervisor, occupied worker ports or pending stage receipts. It verifies the full runtime, saves the original private profile beside it, and atomically adds only the guardian entry. Existing identities, invitations, routes, models and transport pins remain. Repeating the same upgrade is idempotent. Changing an existing guardian pin requires a deliberate new profile; the command does not silently repin it. Add the same entry to the original public settings file before using `configure` again. Keep the private backup out of GitHub.

For the existing managed demonstration:

```powershell
pnpm lab:route-contributors upgrade
pnpm test:containment
```

The managed upgrade checks route identity and active commitments, stops the owned route, upgrades both profiles and their public settings, then reloads the original model. It preserves the installed HTTP/RPC binaries and hashes even if a later local build produced different transport executables. A partial upgrade stays stopped and can be resumed. No migration, new grant, new node identity, new model download or GPU selection is required.

## What the tests cover

`pnpm test:guardian` uses disposable Windows processes with a child, grandchild and independent sibling. It checks supervisor termination, guardian termination, natural parent exit and rejection of an unrelated live target. Both descendant processes and their TCP listeners must disappear; the sibling must stay alive and reachable. These are actual Windows lifecycle tests without an inference model. A separate Windows CI job builds the native guardian and runs these four fixtures. The native parser also has platform-independent tests. Linux CI cannot substitute for Windows lifecycle measurements, and the Windows fixtures do not substitute for the actual model campaign.

`pnpm test:containment` uses the installed 32B CPU route and existing laboratory credits. It sends real requests, checks three receipts and physical-slot serialization, injects owned supervisor/guardian/worker failures during execution, checks zero-charge termination and released claims, verifies the whole contributor process group and its TCP/UDP ports are gone, and reloads the complete model after each fault. Private text is discarded. Raw reports stay under `.runtime/`; publish only the selected non-secret evidence with its environment and result.

## September 15, 2026 measurements

The local campaign used the existing Qwen3-32B Q4_K_M artifact, two CPU contributors, one root, one Windows computer, one operator account and one physical admission slot. The six completed requests each produced 18 input and six output tokens, three accepted receipts and a conserved 36,000-micro-LAB_TU charge. The concurrent pair serialized on the shared physical slot. Two process identities on one machine did not count as two independent providers. [Selected campaign evidence](evidence/qwen3-32b-contributor-containment-v0.11.json).

| Failure injected during real inference | Time until terminal/refunded observation | Consumer charge | Processes gone in the affected contributor |
| --- | ---: | ---: | ---: |
| Supervisor terminated | 35,269 ms | 0 | 5 |
| Guardian terminated | 35,452 ms | 0 | 5 |
| CPU worker terminated | 1,543 ms | 0 | 5 |

All three sessions reached `FAILED / REFUNDED` and retained zero physical claims. Each affected contributor released its TCP and UDP ports; the sibling contributor's five processes remained alive. A complete route reload followed each fault and restored actual inference. The approximately 35-second observations measure coordinator/session resolution, **not OS process-kill latency or a guaranteed recovery time**. The last diagnostic document still said `READY` after the two hard crashes, while process-aware status correctly reported the supervisor was gone.

The [telemetry regression](evidence/qwen3-32b-contributor-status-v0.11.json) also passed with the guardian active: a 9,033 ms Windows status-file read lock did not interrupt a real 23-input/128-output-token request or replace its supervisor/children. Three receipts settled 407,000 micro-LAB_TU. Neither campaign introduced new laboratory grants or produced a ledger projection mismatch. These are short local acceptance measurements, not sustained operation or economic validation.

## Remaining boundaries

This mechanism contains normal contributor descendants under the tested Windows process-creation path. It does not isolate OS accounts, restrict file/network access, encrypt data from the compute peer, enforce CPU/RAM/GPU budgets, or make a hostile engine safe. Creation through another service or broker, such as WMI, is outside the tested process tree. Microsoft documents that some process-creation paths do not inherit a job. [Process inheritance](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects).

Version 0.13 adds separate [root-model and coordinator service supervision](SERVICE_SUPERVISION.md) while preserving the contributor's own guardian. Service installation and reboot recovery still need their own controls. Independent machines, broader OS/GPU profiles, WAN/NAT/relay, adversarial verification and sustainable public economics remain separate [acceptance requirements](../planning/12_ROADMAP_AND_BACKLOG.md). The one-computer experiment must not be presented as independent-provider qualification.
