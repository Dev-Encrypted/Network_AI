// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, copyFile, open } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  hashFile,
  workerEnvironment,
} from "../packages/contributor/src/profile.mjs";
import { protectDirectory } from "../packages/contributor/src/permissions.mjs";
import { atomicJson } from "../packages/contributor/src/state.mjs";
import {
  processIdentity,
  sameProcess,
  serviceStatus,
  withProcessLock,
  discoverServiceRunner,
  prepareWindowsQueries,
} from "./service-process.mjs";
const json = async (file) => JSON.parse(await readFile(file, "utf8"));
export async function ensureServiceGuardian(root, runtime) {
  if (process.platform !== "win32") return null;
  // Prepare OS metadata queries before acquiring any registry mutex or
  // reserving a launch. A cold shell is not an ownership observation.
  await prepareWindowsQueries();
  const directory = join(runtime, "service-supervision"),
    file = join(directory, "guardian.json");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await protectDirectory(directory);
  let pin;
  try {
    pin = await json(file);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (!pin) {
    const source = join(
        root,
        "target/debug/network-ai-contributor-guardian.exe",
      ),
      sha256 = await hashFile(source);
    pin = await withProcessLock(
      join(directory, "bootstrap.lock"),
      async () => {
        try {
          return await json(file);
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
        }
        const path = join(directory, `guardian-${sha256}.exe`);
        await copyFile(source, path, 1).catch((e) => {
          if (e.code !== "EEXIST") throw e;
        });
        if ((await hashFile(path)) !== sha256)
          throw new Error("Service guardian snapshot differs");
        const selected = {
          schema_version: 1,
          protocol: "job_and_global_registry_mutex",
          path,
          sha256,
        };
        await atomicJson(file, selected);
        return selected;
      },
      { path: source, sha256 },
    );
  }
  if (
    pin.protocol !== "job_and_global_registry_mutex" ||
    (await hashFile(pin.path)) !== pin.sha256
  )
    throw new Error(
      "Service guardian pin changed; retain running profiles and inspect",
    );
  return { path: pin.path, sha256: pin.sha256 };
}
export async function updateRegistry(root, runtime, action) {
  const guardian = await ensureServiceGuardian(root, runtime),
    file = join(runtime, "processes.json");
  return withProcessLock(
    join(runtime, "processes.lock"),
    async () => {
      let records = {};
      try {
        records = await json(file);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      const result = await action(records);
      await atomicJson(file, records);
      return result;
    },
    guardian,
  );
}
export async function serviceOwned(entry) {
  if (!entry?.service) return false;
  const s = await serviceStatus(entry.service.profile);
  if (s.live) return true;
  if (Number.isSafeInteger(entry.pid)) {
    const p = await processIdentity(entry.pid);
    if (
      p?.program.toLowerCase() === process.execPath.toLowerCase() &&
      p.command.includes(entry.service.boot_id) &&
      p.command.toLowerCase().includes(entry.service.profile.toLowerCase())
    )
      return true;
  }
  return false;
}
export async function launchService(
  root,
  runtime,
  name,
  program,
  args,
  port,
  options,
  environment,
  hooks = {},
) {
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(name))
    throw new Error("Invalid managed service name");
  const guardian = await ensureServiceGuardian(root, runtime);
  const runner = join(root, "scripts/service-host.mjs");
  const reserved = await updateRegistry(root, runtime, async (records) => {
    const old = records[name];
    if (old?.service) {
      if (await serviceOwned(old)) {
        if (!old.pid) old.pid = (await serviceStatus(old.service.profile)).pid;
        return { entry: old, reused: true };
      }
      if (!old.pid && (await sameProcess(old.service.launcher)))
        return { entry: old, reused: true };
      if (!old.pid) {
        const discovered = await discoverServiceRunner(
          old.service.profile,
          old.service.boot_id,
        );
        if (discovered) {
          old.pid = discovered.pid;
          return { entry: old, reused: true };
        }
        // The originating process has exited and no process bears the exact
        // immutable launch identity. A new boot can now be reserved safely.
      }
    }
    const boot = randomUUID(),
      directory = join(runtime, "managed-services", name, boot),
      file = join(directory, "profile.json");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await protectDirectory(directory);
    const profile = {
      schema_version: 1,
      name,
      boot_id: boot,
      program: resolve(program),
      args,
      cwd: root,
      guardian,
      environment,
      shutdown_file: options.shutdownFile ?? null,
      worker_config: options.workerConfigPath ?? null,
      shutdown_timeout_ms: 10000,
    };
    await writeFile(file, JSON.stringify(profile, null, 2) + "\n", {
      mode: 0o600,
      flag: "wx",
      flush: true,
    });
    const entry = {
      pid: null,
      program,
      args,
      port,
      started_at: new Date().toISOString(),
      options,
      service: {
        profile: file,
        boot_id: boot,
        runner,
        launcher: await processIdentity(process.pid),
      },
    };
    records[name] = entry;
    return { entry, reused: false };
  });
  if (reserved.reused) return reserved.entry;
  const entry = reserved.entry;
  const out = await open(join(runtime, `${name}.out.log`), "a"),
    err = await open(join(runtime, `${name}.err.log`), "a");
  try {
    const child = spawn(
      process.execPath,
      [
        runner,
        "--profile",
        entry.service.profile,
        "--boot-id",
        entry.service.boot_id,
      ],
      {
        cwd: root,
        detached: true,
        windowsHide: true,
        stdio: ["ignore", out.fd, err.fd],
        env: workerEnvironment(),
      },
    );
    await new Promise((res, rej) => {
      child.once("spawn", res);
      child.once("error", rej);
    });
    child.unref();
    entry.pid = child.pid;
    await hooks.spawned?.(entry); // Exercises the durable-intent crash boundary.
    await updateRegistry(root, runtime, (records) => {
      if (records[name]?.service?.boot_id !== entry.service.boot_id)
        throw new Error("Service launch intent changed");
      records[name] = entry;
    });
    return entry;
  } finally {
    await out.close();
    await err.close();
  }
}
