// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// A separate persistent process owns exactly one service and its descendants.
import { spawn } from "node:child_process";
import { writeFile, open } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { startGuardian } from "../packages/contributor/src/guardian.mjs";
import { requestStop as requestWorkerStop } from "../packages/contributor/src/supervisor.mjs";
import {
  workerEnvironment,
  hashFile,
} from "../packages/contributor/src/profile.mjs";
import {
  atomicJson,
  StatusPublisher,
} from "../packages/contributor/src/state.mjs";
import {
  readServiceProfile,
  processIdentity,
  serviceFiles,
  prepareWindowsQueries,
  serviceStopRequested,
} from "./service-process.mjs";
export async function runService(
  profilePath,
  boot,
  { prepareQueries = prepareWindowsQueries } = {},
) {
  const profile = await readServiceProfile(profilePath);
  if (profile.boot_id !== boot || process.platform !== "win32")
    throw new Error("Service profile boot/platform mismatch");
  const files = serviceFiles(profilePath),
    done = Promise.withResolvers();
  // This boot directory belongs to one immutable launch intent. Exclusive
  // creation prevents a repeated launcher from running the same intent twice.
  const claim = await open(files.identity, "wx", 0o600);
  const identity = {
    schema_version: 1,
    boot_id: boot,
    profile_sha256: await hashFile(profilePath),
    runner: null,
    child: null,
    containment: null,
  };
  await claim.writeFile(JSON.stringify(identity));
  await claim.sync();
  await claim.close();
  let child,
    stopping = false,
    phase = "STARTING",
    exitCode = 1;
  const publisher = new StatusPublisher(files.status),
    cancelled = Object.assign(new Error("Service startup was cancelled"), {
      code: "SERVICE_START_CANCELLED",
    }),
    stopRequested = () =>
      serviceStopRequested(profilePath, boot, identity.profile_sha256),
    checkStartupStop = async () => {
      if (await stopRequested()) throw cancelled;
    },
    publish = () =>
      publisher.publish({
        schema_version: 1,
        pid: process.pid,
        boot_id: boot,
        observed_at_unix_ms: Date.now(),
        phase,
        child_pid: child?.pid ?? null,
        application_readiness_asserted: false,
      });
  async function stop(reason) {
    if (stopping) return;
    stopping = true;
    phase = "STOPPING";
    if (reason !== "requested") exitCode = 1;
    if (child && child.exitCode === null && child.signalCode === null) {
      if (profile.shutdown_file || profile.worker_config) {
        if (profile.worker_config)
          await requestWorkerStop(profile.worker_config);
        else await writeFile(profile.shutdown_file, "stop\n", { mode: 0o600 });
        const deadline = Date.now() + profile.shutdown_timeout_ms;
        while (
          child.exitCode === null &&
          child.signalCode === null &&
          Date.now() < deadline
        )
          await delay(50);
      }
      if (child.exitCode === null && child.signalCode === null) child.kill();
    }
    done.resolve();
  }
  try {
    await checkStartupStop();
    identity.containment = await startGuardian(profile.guardian, boot);
    await atomicJson(files.identity, identity);
    await publish();
    // OS-query bootstrap also creates a child process. Establish the job
    // before that helper exists, then record the observed runner identity.
    // A cold query can take up to 20 seconds. Monitor the boot-bound stop while
    // preparing metadata; exiting the host also removes the helper from its job.
    const monitoring = new AbortController();
    const stopped = (async () => {
      for (;;) {
        await checkStartupStop();
        await delay(100, undefined, { signal: monitoring.signal });
      }
    })();
    try {
      identity.runner = await Promise.race([
        (async () => {
          await prepareQueries();
          return processIdentity(process.pid);
        })(),
        stopped,
      ]);
    } finally {
      monitoring.abort();
    }
    if (!identity.runner)
      throw new Error("Service runner identity unavailable");
    await atomicJson(files.identity, identity);
    await checkStartupStop();
    child = spawn(profile.program, profile.args, {
      cwd: profile.cwd,
      windowsHide: true,
      stdio: ["ignore", "inherit", "inherit"],
      env: { ...workerEnvironment(), ...profile.environment },
    });
    child.once("error", () => {
      void stop("spawn_failed").catch(() => done.resolve());
    });
    child.once("exit", (code) => {
      exitCode = stopping ? exitCode : (code ?? 1);
      phase = stopping ? "STOPPED" : "CHILD_EXITED";
      done.resolve();
    });
    await new Promise((res, rej) => {
      child.once("spawn", res);
      child.once("error", rej);
    });
    identity.child = await processIdentity(child.pid);
    if (!identity.child)
      throw new Error("Service exited before identity observation");
    await atomicJson(files.identity, identity);
    phase = "RUNNING";
    exitCode = 0;
    await publish();
    let finished = false;
    done.promise.then(() => {
      finished = true;
    });
    while (!finished) {
      if (await stopRequested()) await stop("requested");
      if (finished) break;
      await publish();
      await Promise.race([done.promise, delay(500)]);
    }
    phase = stopping ? "STOPPED" : "CHILD_EXITED";
    await publish();
  } catch (error) {
    phase = error === cancelled ? "STOPPED" : "FAILED";
    exitCode = error === cancelled ? 0 : 1;
    if (error !== cancelled)
      console.error(
        JSON.stringify({
          event: "service_host_failed",
          code: error.code ?? "SERVICE_LIFECYCLE_FAILURE",
          name: profile.name,
        }),
      );
  } finally {
    if (child && child.exitCode === null && child.signalCode === null)
      child.kill();
    // Closing the parent ends the guardian's wait and its sole job handle.
    // This also ends grandchildren after a child crash or failed graceful stop.
    await publish().catch(() => {});
  }
  return exitCode;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const { values } = parseArgs({
    options: { profile: { type: "string" }, "boot-id": { type: "string" } },
  });
  const code = await runService(resolve(values.profile), values["boot-id"]);
  process.exit(code);
}
