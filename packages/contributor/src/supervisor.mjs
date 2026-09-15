// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { connect, createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { createStageAgent } from "./stage.mjs";
import {
  loadProfile,
  componentConfigs,
  workerEnvironment,
  requireValue,
  hashFile,
} from "./profile.mjs";
import { protectDirectory } from "./permissions.mjs";
import { atomicJson, StatusPublisher } from "./state.mjs";
import { startGuardian } from "./guardian.mjs";
import { prepareDevice } from "./devices.mjs";

async function json(file, value) {
  await atomicJson(file, value);
}
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code !== "ESRCH";
  }
}
async function tcpReady(port) {
  return new Promise((resolve) => {
    const s = connect({ host: "127.0.0.1", port });
    const done = (result) => {
      s.destroy();
      resolve(result);
    };
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
    s.setTimeout(300, () => done(false));
  });
}
async function tcpFree(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () =>
      server.close(() => resolve(true)),
    );
  });
}
export async function startWorker(file) {
  const loaded = await loadProfile(file),
    c = loaded.profile,
    state = loaded.state;
  const device = await prepareDevice(c);
  await mkdir(state, { recursive: true, mode: 0o700 });
  await protectDirectory(loaded.directory);
  await protectDirectory(state);
  const lock = join(state, "worker.lock"),
    statusFile = join(state, "worker-status.json"),
    stopFile = join(state, "stop.request");
  const boot = randomUUID(),
    finished = Promise.withResolvers();
  let handle;
  try {
    handle = await open(lock, "wx", 0o600);
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    const previous = JSON.parse(await readFile(lock, "utf8"));
    requireValue(
      Number.isSafeInteger(previous.pid) &&
        previous.pid > 0 &&
        !alive(previous.pid),
      "worker_already_running",
    );
    await unlink(lock);
    handle = await open(lock, "wx", 0o600);
  }
  await handle.writeFile(JSON.stringify({ pid: process.pid, boot_id: boot }));
  await handle.close();
  const children = [],
    logs = [];
  let agent,
    containment = null,
    timer,
    phase = "STARTING",
    stopping = false,
    polling = false,
    failure = null;
  const fingerprint = await hashFile(loaded.path);
  const statusPublisher = new StatusPublisher(statusFile);
  async function status(ready = false) {
    await statusPublisher.publish({
      schema_version: 1,
      pid: process.pid,
      boot_id: boot,
      observed_at_unix_ms: Date.now(),
      node_id: c.node.id,
      route_id: c.binding.route_id,
      profile_sha256: fingerprint,
      engine_id: c.engine.id,
      device: device?.snapshot() ?? null,
      rpc_memory: agent?.health().rpc_memory ?? null,
      phase,
      ready: Boolean(ready && !stopping),
      failure,
      component_pids: Object.fromEntries(children.map((p) => [p.label, p.pid])),
      containment,
      readiness_source: "coordinator_route_lease",
      scope: "private_contributor_processes; not physical-host qualification",
    });
  }
  // Serialize status writes so a slow periodic observation cannot overwrite STOPPED.
  let statusQueue = Promise.resolve();
  const publish = (ready) => {
    const next = statusQueue.then(() => status(ready));
    statusQueue = next.catch(() => {});
    return next;
  };
  async function stop(reason = null) {
    if (stopping) return finished.promise;
    stopping = true;
    failure = reason;
    phase = "STOPPING";
    clearInterval(timer);
    await publish(false).catch(() => {});
    await agent?.stop().catch(() => {});
    for (const p of children)
      if (p.exitCode === null && p.signalCode === null) p.kill();
    await Promise.all(children.map((p) => p.ended));
    for (const stream of logs) stream.end();
    phase = reason ? "FAILED" : "STOPPED";
    await publish(false).catch(() => {});
    await unlink(lock).catch(() => {});
    finished.resolve({ phase, failure });
    return finished.promise;
  }
  function launch(label, program, args, extra = {}) {
    requireValue(!stopping, "worker_stopping");
    const log = createWriteStream(join(state, `${label}.log`), {
      flags: "a",
      mode: 0o600,
    });
    logs.push(log);
    const child = spawn(program, args, {
      cwd: state,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...workerEnvironment(), ...extra },
    });
    child.label = label;
    child.ended = new Promise((resolve) => {
      child.once("error", () => {
        resolve();
        void stop(`${label}_start_failed`);
      });
      child.once("exit", () => {
        resolve();
        if (!stopping) void stop(`${label}_exited`);
      });
    });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    children.push(child);
    return child;
  }
  async function waitFor(probe) {
    const until = Date.now() + 15000;
    while (!stopping && Date.now() < until) {
      if (await probe()) return;
      await delay(100);
    }
    throw Object.assign(new Error("worker_start_timeout"), {
      code: "worker_start_timeout",
    });
  }
  try {
    await unlink(stopFile).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
    for (const port of [c.node.http_port, ...Object.values(c.ports)])
      requireValue(await tcpFree(port), "worker_port_occupied");
    containment = await startGuardian(c.binaries.guardian, boot);
    await publish(false);
    const configs = componentConfigs(c, state),
      controlFile = join(state, "control-link.json"),
      rpcFile = join(state, "rpc.json");
    await json(controlFile, configs.control);
    await json(rpcFile, configs.rpc);
    launch(
      "worker",
      join(c.engine.directory, loaded.pin.entry),
      [
        "--host",
        "127.0.0.1",
        "--port",
        String(c.ports.worker_rpc),
        "--device",
        device?.engineDevice ?? "CPU",
        "--threads",
        String(c.threads),
      ],
      device?.environment ?? {},
    );
    await waitFor(() => tcpReady(c.ports.worker_rpc));
    launch("control_link", c.binaries.http.path, [], {
      NETWORK_AI_LINK_CONFIG: controlFile,
    });
    await waitFor(() => tcpReady(c.ports.control_forward));
    agent = await createStageAgent(configs.stage, {
      rpcListenPort: c.ports.guard_rpc,
      rpcTargetPort: c.ports.worker_rpc,
      startupComputeCommands: c.startup_compute_commands,
      routeBinding: c.binding,
      memoryBudget: device?.memoryBudget,
      memoryFreeBytes: device?.freeBytes,
      deviceSnapshot: device?.snapshot,
    });
    if (stopping) await agent.stop();
    requireValue(!stopping, "worker_stopping");
    const rpcChild = launch("rpc_link", c.binaries.rpc.path, [
      "--config",
      rpcFile,
    ]);
    await waitFor(async () => {
      try {
        const s = JSON.parse(
          await readFile(join(state, "rpc-status.json"), "utf8"),
        );
        return (
          s.pid === rpcChild.pid &&
          Math.abs(Date.now() - s.observed_at_unix_ms) < 5000
        );
      } catch {
        return false;
      }
    });
    phase = "WAITING_ROOT";
    await publish(false);
    timer = setInterval(() => {
      if (stopping || polling) return;
      polling = true;
      void (async () => {
        try {
          const request = JSON.parse(await readFile(stopFile, "utf8"));
          if (request.boot_id === boot) {
            void stop();
            return;
          }
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
        }
        // The guard lives in this process. Use its exact HTTP health snapshot
        // directly; a loopback fetch timeout is not evidence that a child died.
        const health = agent.health();
        requireValue(health.node_id === c.node.id, "worker_guard_identity");
        if (!stopping) {
          phase = health.ready ? "READY" : "WAITING_ROOT";
          await publish(health.ready);
        }
      })()
        .catch((error) => {
          const code = /^[a-z_]{1,64}$/.test(error.code ?? "")
            ? error.code
            : "worker_monitor_failed";
          console.error(
            JSON.stringify({
              event: "worker_monitor_failed",
              code,
              io_code: error.io_code ?? null,
              operation: error.atomic_operation ?? null,
            }),
          );
          void stop(code);
        })
        .finally(() => {
          polling = false;
        });
    }, 500);
    return { stop, closed: finished.promise, state, statusFile };
  } catch (e) {
    await stop(e.code ?? "worker_start_failed");
    throw e;
  }
}
export async function workerStatus(file) {
  const { state } = await loadProfile(file, false);
  const status = JSON.parse(
    await readFile(join(state, "worker-status.json"), "utf8"),
  );
  const processAlive =
      Number.isSafeInteger(status.pid) && status.pid > 0 && alive(status.pid),
    fresh = Math.abs(Date.now() - status.observed_at_unix_ms) < 5000;
  return {
    ...status,
    process_alive: processAlive,
    status_fresh: fresh,
    last_reported_ready: Boolean(status.ready),
    ready: Boolean(
      status.ready && processAlive && fresh && status.phase === "READY",
    ),
    live:
      processAlive &&
      fresh &&
      ["READY", "WAITING_ROOT", "STARTING"].includes(status.phase),
  };
}
export async function requestStop(file) {
  const { state } = await loadProfile(file, false);
  const lock = JSON.parse(await readFile(join(state, "worker.lock"), "utf8"));
  requireValue(
    Number.isSafeInteger(lock.pid) &&
      lock.pid > 0 &&
      alive(lock.pid) &&
      /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(lock.boot_id ?? ""),
    "worker_not_running",
  );
  await json(join(state, "stop.request"), {
    boot_id: lock.boot_id,
    requested_at_unix_ms: Date.now(),
  });
  return { requested: true, boot_id: lock.boot_id };
}
