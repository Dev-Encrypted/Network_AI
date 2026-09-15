// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Windows-only OS evidence, with disposable processes and no model or lab state.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { connect } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { hashFile } from "../../packages/contributor/src/profile.mjs";
const binary = resolve("target/debug/network-ai-contributor-guardian.exe");
const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code !== "ESRCH";
  }
};
async function until(fn) {
  const end = Date.now() + 12000;
  do {
    if (await fn()) return;
    await delay(50);
  } while (Date.now() < end);
  throw new Error("Owned fixture did not reach its expected process state");
}
function reachable(port) {
  return new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1");
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(500, () => done(false));
  });
}
function identity(pid) {
  assert.ok(Number.isSafeInteger(pid) && pid > 0);
  const text = execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $env:NAI_FIXTURE_PID) | Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress",
    ],
    {
      windowsHide: true,
      encoding: "utf8",
      env: { ...process.env, NAI_FIXTURE_PID: String(pid) },
    },
  ).trim();
  return text ? JSON.parse(text) : null;
}
function terminateOwned(pid, fixture, program, parent) {
  const current = identity(pid);
  if (!current) return;
  assert.equal(current.ExecutablePath.toLowerCase(), program.toLowerCase());
  assert.ok(current.CommandLine.includes(fixture));
  if (parent) assert.equal(current.ParentProcessId, parent);
  process.kill(pid);
}
function message(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Fixture startup timed out")),
      15000,
    );
    child.once("message", (value) => {
      clearTimeout(timer);
      resolve(value);
    });
    child.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("Fixture exited before startup"));
    });
  });
}
for (const action of ["supervisor_kill", "guardian_kill", "parent_exit"]) {
  test(
    `Windows job contains descendants after ${action}; sibling survives`,
    { skip: process.platform !== "win32", timeout: 40000 },
    async (t) => {
      const fixture = randomUUID(),
        sentinelId = randomUUID();
      const sentinel = spawn(
        process.execPath,
        [resolve("tests/guardian/fixtures/leaf.mjs"), sentinelId, "leaf"],
        { windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"] },
      );
      t.after(() => {
        if (sentinel.exitCode === null && sentinel.signalCode === null)
          sentinel.kill();
      });
      const sibling = await message(sentinel);
      const parent = spawn(
        process.execPath,
        [
          resolve("tests/guardian/fixtures/parent.mjs"),
          binary,
          await hashFile(binary),
          fixture,
        ],
        { windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"] },
      );
      parent.stdout.resume();
      parent.stderr.resume();
      let started;
      t.after(async () => {
        if (parent.exitCode === null && parent.signalCode === null)
          parent.kill();
        if (!started?.guard) return;
        await delay(100);
        for (const [pid, program] of [
          [started.guard.guardian_pid, binary],
          [started.leaf.pid, process.execPath],
          [started.leaf.grandchild.pid, process.execPath],
        ]) {
          if (isAlive(pid)) terminateOwned(pid, fixture, program);
        }
      });
      started = await message(parent);
      assert.ok(!started.error, started.error);
      assert.equal(started.guard.parent_pid, parent.pid);
      assert.equal(started.guard.boot_id, fixture);
      assert.equal(started.guard.kill_on_close, true);
      assert.equal(started.guard.breakaway_allowed, false);
      const child = started.leaf,
        grandchild = child.grandchild;
      assert.ok(await reachable(child.port));
      assert.ok(await reachable(grandchild.port));
      if (action === "guardian_kill")
        terminateOwned(started.guard.guardian_pid, fixture, binary, parent.pid);
      else if (action === "supervisor_kill") parent.kill();
      else parent.send("exit");
      await until(() =>
        [
          parent.pid,
          started.guard.guardian_pid,
          child.pid,
          grandchild.pid,
        ].every((pid) => !isAlive(pid)),
      );
      assert.equal(await reachable(child.port), false);
      assert.equal(await reachable(grandchild.port), false);
      assert.ok(isAlive(sibling.pid));
      assert.ok(await reachable(sibling.port));
    },
  );
}
test(
  "guardian refuses an unrelated process as its parent without altering it",
  { skip: process.platform !== "win32", timeout: 15000 },
  async (t) => {
    const sentinelId = randomUUID();
    const sentinel = spawn(
      process.execPath,
      [resolve("tests/guardian/fixtures/leaf.mjs"), sentinelId, "leaf"],
      { windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"] },
    );
    t.after(() => {
      if (sentinel.exitCode === null && sentinel.signalCode === null)
        sentinel.kill();
    });
    const sibling = await message(sentinel);
    const guardian = spawn(
      binary,
      ["--parent-pid", String(sibling.pid), "--boot-id", randomUUID()],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "",
      err = "";
    guardian.stdout.on("data", (c) => {
      out += c;
    });
    guardian.stderr.on("data", (c) => {
      err += c;
    });
    const code = await new Promise((resolve, reject) => {
      guardian.once("exit", resolve);
      guardian.once("error", reject);
    });
    assert.equal(code, 1);
    assert.equal(out, "");
    assert.equal(JSON.parse(err).error, "guardian_parent_mismatch");
    assert.ok(isAlive(sibling.pid));
    assert.ok(await reachable(sibling.port));
  },
);
