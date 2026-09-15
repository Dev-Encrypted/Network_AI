// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Private process ownership, independent of a diagnostic status file.
import { execFile, spawn } from "node:child_process";
import { readFile, readlink, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { randomUUID, createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { atomicJson } from "../packages/contributor/src/state.mjs";
import {
  hashFile,
  workerEnvironment,
} from "../packages/contributor/src/profile.mjs";
const { z } = createRequire(
  new URL("../packages/contributor/package.json", import.meta.url),
)("zod");
const exec = promisify(execFile);
async function windowsQuery(script, variables, maxBuffer = 131072) {
  const environment = workerEnvironment();
  const windows = Object.entries(environment).find(
    ([key]) => key.toLowerCase() === "systemroot",
  )?.[1];
  if (!windows) throw new Error("Windows system directory is unavailable");
  const shellDirectory = join(windows, "System32/WindowsPowerShell/v1.0");
  const pending = exec(
    join(shellDirectory, "powershell.exe"),
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';" +
        "Import-Module ($PSHOME+'\\Modules\\CimCmdlets\\CimCmdlets.psd1');" +
        "Import-Module ($PSHOME+'\\Modules\\Microsoft.PowerShell.Utility\\Microsoft.PowerShell.Utility.psd1');" +
        script,
    ],
    {
      windowsHide: true,
      encoding: "utf8",
      timeout: 5000,
      maxBuffer,
      env: {
        ...environment,
        PSModulePath: join(shellDirectory, "Modules"),
        ...variables,
      },
    },
  );
  // This read-only command has no input protocol. Do not leave an open stdin
  // pipe or inherit user/module discovery settings in a detached service.
  pending.child.stdin.end();
  return pending;
}
const binary = z
  .object({
    path: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const serviceProfileSchema = z
  .object({
    schema_version: z.literal(1),
    name: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    boot_id: z.uuid(),
    program: z.string().min(1),
    args: z.array(z.string().max(32768)).max(100),
    cwd: z.string().min(1),
    guardian: binary,
    environment: z
      .object({
        NETWORK_AI_CONFIG: z.string().optional(),
        NETWORK_AI_LINK_CONFIG: z.string().optional(),
        NETWORK_AI_CONTROL_URL: z.string().optional(),
        NETWORK_AI_GATEWAY_URL: z.string().optional(),
        NEXT_TELEMETRY_DISABLED: z.literal("1").optional(),
      })
      .strict(),
    shutdown_file: z.string().min(1).nullable(),
    worker_config: z.string().min(1).nullable(),
    shutdown_timeout_ms: z.number().int().min(100).max(15000),
  })
  .strict();
export async function readServiceProfile(file) {
  const p = serviceProfileSchema.parse(
    JSON.parse(await readFile(file, "utf8")),
  );
  for (const value of [
    p.program,
    p.cwd,
    p.guardian.path,
    ...(p.shutdown_file ? [p.shutdown_file] : []),
    ...(p.worker_config ? [p.worker_config] : []),
  ])
    if (resolve(value) !== value)
      throw new Error("Service paths must be absolute and normalized");
  return p;
}
export async function processIdentity(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1)
    throw new Error("Invalid process identity");
  try {
    process.kill(pid, 0);
  } catch (e) {
    if (e.code === "ESRCH") return null;
    if (e.code !== "EPERM") throw e;
  }
  if (process.platform === "win32") {
    for (let attempt = 0; attempt < 4; attempt++) {
      const { stdout } = await windowsQuery(
        "$p=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$env:NAI_SERVICE_QUERY_PID); if($p){[pscustomobject]@{pid=[int]$p.ProcessId;parent_pid=[int]$p.ParentProcessId;program=$p.ExecutablePath;command=$p.CommandLine;created=$p.CreationDate.ToUniversalTime().ToString('o')} | ConvertTo-Json -Compress}",
        { NAI_SERVICE_QUERY_PID: String(pid) },
      );
      if (!stdout.trim()) return null;
      const identity = JSON.parse(stdout);
      if (
        identity.pid === pid &&
        typeof identity.program === "string" &&
        identity.program.length > 0 &&
        typeof identity.command === "string" &&
        identity.command.length > 0 &&
        typeof identity.created === "string" &&
        identity.created.length > 0
      )
        return identity;
      // CIM can retain the process row briefly after termination while clearing
      // its command/path. Retry the observation; never adopt an unreadable PID.
      try {
        process.kill(pid, 0);
      } catch (e) {
        if (e.code === "ESRCH") return null;
        if (e.code !== "EPERM") throw e;
      }
      if (attempt < 3) await delay(50);
    }
    throw new Error(
      "Live process identity is temporarily unavailable; retain its registry entry",
    );
  }
  try {
    const stat = await readFile(`/proc/${pid}/stat`, "utf8"),
      fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    return {
      pid,
      parent_pid: Number(fields[1]),
      program: await readlink(`/proc/${pid}/exe`),
      command: (await readFile(`/proc/${pid}/cmdline`, "utf8")).replaceAll(
        "\0",
        " ",
      ),
      created: fields[19],
    };
  } catch (e) {
    if (e.code === "ENOENT" || e.code === "ESRCH") return null;
    throw e;
  }
}
export async function sameProcess(expected) {
  if (!expected) return false;
  const current = await processIdentity(expected.pid);
  return Boolean(
    current &&
    current.created === expected.created &&
    current.program === expected.program,
  );
}
export async function childProcessIdentities(parentPid) {
  if (
    process.platform !== "win32" ||
    !Number.isSafeInteger(parentPid) ||
    parentPid < 1
  )
    throw new Error("Invalid Windows parent identity");
  const { stdout } = await windowsQuery(
    "$serviceChildren=@(Get-CimInstance Win32_Process -Filter ('ParentProcessId = '+$env:NAI_SERVICE_QUERY_PID) | Select-Object -ExpandProperty ProcessId);ConvertTo-Json -InputObject $serviceChildren -Compress",
    { NAI_SERVICE_QUERY_PID: String(parentPid) },
    65536,
  );
  const ids = JSON.parse(stdout);
  if (!Array.isArray(ids) || ids.length > 64)
    throw new Error("Unexpected service child inventory");
  return (await Promise.all(ids.map(processIdentity))).filter(
    (p) => p && p.parent_pid === parentPid,
  );
}
export async function discoverServiceRunner(profilePath, boot) {
  if (process.platform !== "win32")
    throw new Error("Service discovery is not qualified on this platform");
  z.uuid().parse(boot);
  const { stdout } = await windowsQuery(
    "$serviceCandidates=@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -and $_.CommandLine -and $_.ExecutablePath.ToLowerInvariant() -eq $env:NAI_SERVICE_NODE.ToLowerInvariant() -and $_.CommandLine.ToLowerInvariant().Contains($env:NAI_SERVICE_PROFILE.ToLowerInvariant()) -and $_.CommandLine.Contains($env:NAI_SERVICE_BOOT)} | ForEach-Object {[pscustomobject]@{pid=[int]$_.ProcessId;parent_pid=[int]$_.ParentProcessId;program=$_.ExecutablePath;command=$_.CommandLine;created=$_.CreationDate.ToUniversalTime().ToString('o')}});ConvertTo-Json -InputObject $serviceCandidates -Compress",
    {
      NAI_SERVICE_NODE: process.execPath,
      NAI_SERVICE_PROFILE: resolve(profilePath),
      NAI_SERVICE_BOOT: boot,
    },
  );
  const candidates = JSON.parse(stdout);
  if (!Array.isArray(candidates) || candidates.length > 1)
    throw new Error(
      "Ambiguous service boot; preserve all processes for inspection",
    );
  return candidates[0] ?? null;
}
export async function withProcessLock(file, action, guardian) {
  const path = join(
    await realpath(dirname(file)),
    file.slice(dirname(file).length + 1),
  );
  const key = createHash("sha256")
      .update(process.platform === "win32" ? path.toLowerCase() : path)
      .digest("hex"),
    boot = randomUUID();
  if (
    process.platform === "win32" &&
    (!guardian || (await hashFile(guardian.path)) !== guardian.sha256)
  )
    throw new Error("Registry guardian pin missing or changed");
  const child =
    process.platform === "win32"
      ? spawn(
          guardian.path,
          [
            "--parent-pid",
            String(process.pid),
            "--boot-id",
            boot,
            "--registry-lock",
            key,
          ],
          {
            windowsHide: true,
            stdio: ["pipe", "pipe", "pipe"],
            env: workerEnvironment(),
          },
        )
      : spawn(
          "flock",
          [
            "--exclusive",
            "--timeout",
            "15",
            file,
            process.execPath,
            "-e",
            "process.stdout.write('LOCKED\\n');process.stdin.resume();process.stdin.on('end',()=>process.exit(0));",
          ],
          { stdio: ["pipe", "pipe", "pipe"] },
        );
  let released = false,
    held = false;
  // Loss of the lock holder must stop the owning CLI before it can continue a
  // registry mutation. This helper is used only by disposable lab commands.
  const lost = () => {
    if (held && !released) {
      console.error("Service registry lock holder exited unexpectedly");
      process.exit(1);
    }
  };
  child.once("exit", lost);
  child.stdin.on("error", () => {});
  child.stderr.resume();
  try {
    await new Promise((res, rej) => {
      let output = "";
      const timer = setTimeout(
        () => rej(new Error("Registry mutex acknowledgement timed out")),
        20000,
      );
      const fail = () => {
        clearTimeout(timer);
        rej(new Error("Registry mutex unavailable"));
      };
      child.once("error", fail);
      child.once("exit", fail);
      child.stdout.on("data", (chunk) => {
        output += chunk;
        if (output.length > 4096) {
          fail();
          return;
        }
        if (!output.includes("\n")) return;
        try {
          if (process.platform === "win32") {
            const a = JSON.parse(output);
            if (
              a.kind !== "registry_mutex" ||
              a.namespace !== "global" ||
              a.parent_pid !== process.pid ||
              a.guardian_pid !== child.pid ||
              a.boot_id !== boot ||
              a.lock_key !== key
            )
              throw new Error("Registry mutex binding");
          } else if (output !== "LOCKED\n")
            throw new Error("Unexpected registry lock acknowledgement");
          held = true;
          clearTimeout(timer);
          res();
        } catch (e) {
          clearTimeout(timer);
          rej(e);
        }
      });
    });
    return await action();
  } finally {
    released = true;
    child.stdin.end();
    if (!held && child.exitCode === null && child.signalCode === null)
      child.kill();
    child.unref();
    child.stdout.destroy();
    child.stderr.destroy();
  }
}
export function serviceFiles(profilePath) {
  const directory = dirname(resolve(profilePath));
  return {
    status: join(directory, "status.json"),
    identity: join(directory, "identity.json"),
    stop: join(directory, "stop.request.json"),
  };
}
export async function serviceStatus(profilePath) {
  const profile = await readServiceProfile(profilePath),
    files = serviceFiles(profilePath);
  let identity = null,
    status = null;
  try {
    identity = JSON.parse(await readFile(files.identity, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT" && !(e instanceof SyntaxError)) throw e;
  }
  if (identity && identity.profile_sha256 !== (await hashFile(profilePath)))
    throw new Error(
      "Service launch profile changed; preserve its running state",
    );
  try {
    status = JSON.parse(await readFile(files.status, "utf8"));
  } catch {}
  let live = false,
    childAlive = false;
  if (
    identity?.boot_id === profile.boot_id &&
    identity.runner &&
    (await sameProcess(identity.runner))
  ) {
    const current = await processIdentity(identity.runner.pid);
    live = Boolean(
      current?.command.includes(profile.boot_id) &&
      current.command
        .toLowerCase()
        .includes(resolve(profilePath).toLowerCase()),
    );
    if (live && identity.child) childAlive = await sameProcess(identity.child);
  }
  const fresh = Boolean(
    live &&
    status?.boot_id === profile.boot_id &&
    status.pid === identity.runner.pid &&
    Math.abs(Date.now() - status.observed_at_unix_ms) < 5000,
  );
  return {
    boot_id: profile.boot_id,
    live,
    child_alive: childAlive,
    status_fresh: fresh,
    phase: fresh ? status.phase : live ? "DIAGNOSTIC_UNAVAILABLE" : "STOPPED",
    pid: identity?.runner?.pid ?? null,
    child_pid: live ? (identity.child?.pid ?? null) : null,
    containment: live ? (identity.containment ?? null) : null,
    identity,
    scope: "owned_process_tree_only; application_readiness_is_separate",
  };
}
export async function requestServiceStop(profilePath) {
  const current = await serviceStatus(profilePath);
  if (!current.live) return false;
  await atomicJson(serviceFiles(profilePath).stop, {
    boot_id: current.boot_id,
  });
  return true;
}
