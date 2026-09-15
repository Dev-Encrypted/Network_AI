// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Real Windows service/descendant processes, without model weights or live lab state.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import {
  launchService,
  serviceOwned,
  updateRegistry,
  ensureServiceGuardian,
} from "../../scripts/service-manager.mjs";
import {
  serviceStatus,
  serviceFiles,
  requestServiceStop,
  processIdentity,
} from "../../scripts/service-process.mjs";
const root = resolve("."),
  options = { skip: process.platform !== "win32", timeout: 60000 };
const json = async (file) => JSON.parse(await readFile(file, "utf8"));
async function until(probe) {
  const end = Date.now() + 20000;
  do {
    const result = await probe();
    if (result) return result;
    await delay(50);
  } while (Date.now() < end);
  throw new Error("Service fixture observation timed out");
}
function reachable(port) {
  return new Promise((res) => {
    const socket = connect(port, "127.0.0.1"),
      done = (value) => {
        socket.destroy();
        res(value);
      };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(300, () => done(false));
  });
}
async function fixture(t) {
  const runtime = join(root, ".runtime", `service-fixture-${randomUUID()}`);
  await mkdir(runtime, { recursive: true });
  const entries = [];
  t.after(async () => {
    for (const entry of entries)
      if (await serviceOwned(entry)) {
        await requestServiceStop(entry.service.profile);
        await until(async () => !(await serviceOwned(entry)));
      }
  });
  async function launch(name = "owned") {
    const output = join(runtime, name + ".tree.json");
    const entry = await launchService(
      root,
      runtime,
      name,
      process.execPath,
      [join(root, "tests/guardian/fixtures/service-tree.mjs"), output, "tree"],
      0,
      {},
      {},
    );
    entries.push(entry);
    const tree = await until(() => json(output).catch(() => null));
    const status = await until(async () => {
      const s = await serviceStatus(entry.service.profile);
      return s.live && s.child_alive && s.phase === "RUNNING" ? s : null;
    });
    assert.equal(tree.pid, status.child_pid);
    assert.equal(status.containment.kind, "windows_job");
    assert.equal(status.containment.parent_pid, status.pid);
    return { entry, tree, status, output };
  }
  return { runtime, launch };
}
for (const fault of ["host", "guardian", "child_exit"]) {
  test(
    `managed service ${fault} loss removes its process tree and preserves a sibling`,
    options,
    async (t) => {
      const f = await fixture(t),
        a = await f.launch(),
        sibling = await f.launch("sibling");
      assert.equal(await reachable(a.tree.port), true);
      assert.equal(await reachable(a.tree.descendant.port), true);
      const beforeFault = await serviceStatus(a.entry.service.profile);
      assert.equal(beforeFault.live, true);
      assert.equal(beforeFault.child_alive, true);
      assert.equal(beforeFault.pid, a.status.pid);
      assert.ok(await processIdentity(a.tree.descendant.pid));
      if (fault === "child_exit") await writeFile(a.output + ".exit", "exit");
      else {
        const pid =
          fault === "host" ? a.status.pid : a.status.containment.guardian_pid;
        const identity = await processIdentity(pid);
        assert.ok(identity.command.includes(a.status.boot_id));
        if (fault === "guardian")
          assert.equal(identity.parent_pid, a.status.pid);
        process.kill(pid);
      }
      await until(async () => !(await serviceOwned(a.entry)));
      await until(
        async () =>
          !(await reachable(a.tree.port)) &&
          !(await reachable(a.tree.descendant.port)),
      );
      for (const pid of [
        a.status.pid,
        a.status.containment.guardian_pid,
        a.tree.pid,
        a.tree.descendant.pid,
      ])
        assert.equal(await processIdentity(pid), null);
      assert.equal(await serviceOwned(sibling.entry), true);
      assert.equal(await reachable(sibling.tree.port), true);
    },
  );
}
test(
  "a stop request must name the current service boot",
  options,
  async (t) => {
    const f = await fixture(t),
      a = await f.launch();
    await writeFile(
      serviceFiles(a.entry.service.profile).stop,
      JSON.stringify({ boot_id: randomUUID() }),
    );
    await delay(750);
    assert.equal(await serviceOwned(a.entry), true);
    assert.equal(await reachable(a.tree.port), true);
    await requestServiceStop(a.entry.service.profile);
    await until(async () => !(await serviceOwned(a.entry)));
    await until(async () => !(await reachable(a.tree.descendant.port)));
  },
);
test(
  "concurrent service registration preserves updates and starts one boot per name",
  options,
  async (t) => {
    const f = await fixture(t);
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        updateRegistry(root, f.runtime, (records) => {
          records[`fixture_${i}`] = { counter: i };
        }),
      ),
    );
    assert.equal(
      Object.keys(await json(join(f.runtime, "processes.json"))).length,
      8,
    );
    const [a, b] = await Promise.all([f.launch("same"), f.launch("same")]);
    assert.equal(a.entry.service.boot_id, b.entry.service.boot_id);
    assert.equal(a.status.pid, b.status.pid);
    const records = await json(join(f.runtime, "processes.json"));
    assert.equal(Object.keys(records).length, 9);
    assert.equal(records.same.pid, a.status.pid);
  },
);
async function interruptedCaller(runtime, mode) {
  const child = spawn(
    process.execPath,
    [
      join(root, "tests/guardian/fixtures/interrupted-service-launch.mjs"),
      root,
      runtime,
      mode,
    ],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stdout.resume();
  let error = "";
  child.stderr.on("data", (chunk) => {
    error += chunk;
  });
  const code = await new Promise((res, rej) => {
    child.once("exit", res);
    child.once("error", rej);
  });
  assert.equal(code, 0, error);
}
test(
  "an interrupted launcher is reconciled to the same live service boot",
  options,
  async (t) => {
    const f = await fixture(t);
    await interruptedCaller(f.runtime, "launch");
    const initial = (await json(join(f.runtime, "processes.json"))).interrupted;
    assert.equal(initial.pid, null);
    const old = await until(async () => {
      const s = await serviceStatus(initial.service.profile);
      return s.live && s.child_alive ? s : null;
    });
    const resumed = await f.launch("interrupted");
    assert.equal(resumed.status.pid, old.pid);
    assert.equal(resumed.entry.service.boot_id, initial.service.boot_id);
    assert.equal(
      (await json(join(f.runtime, "processes.json"))).interrupted.pid,
      old.pid,
    );
  },
);
test(
  "a registry mutex is released when its owning launcher exits",
  options,
  async (t) => {
    const f = await fixture(t);
    await interruptedCaller(f.runtime, "mutex");
    assert.ok((await json(join(f.runtime, "mutex-acquired.json"))).pid);
    await updateRegistry(root, f.runtime, (records) => {
      records.recovered = { counter: 1 };
    });
    assert.equal(
      (await json(join(f.runtime, "processes.json"))).recovered.counter,
      1,
    );
  },
);

test(
  "a changed guardian hash refuses to start the service child",
  options,
  async (t) => {
    const f = await fixture(t),
      guardian = await ensureServiceGuardian(root, f.runtime);
    const boot = randomUUID(),
      directory = join(f.runtime, "invalid-pin", boot),
      profilePath = join(directory, "profile.json"),
      output = join(directory, "child-started.json");
    await mkdir(directory, { recursive: true });
    await writeFile(
      profilePath,
      JSON.stringify({
        schema_version: 1,
        name: "invalid",
        boot_id: boot,
        program: process.execPath,
        args: [
          join(root, "tests/guardian/fixtures/service-tree.mjs"),
          output,
          "tree",
        ],
        cwd: root,
        guardian: { ...guardian, sha256: "0".repeat(64) },
        environment: {},
        shutdown_file: null,
        worker_config: null,
        shutdown_timeout_ms: 1000,
      }),
    );
    const child = spawn(
      process.execPath,
      [
        join(root, "scripts/service-host.mjs"),
        "--profile",
        profilePath,
        "--boot-id",
        boot,
      ],
      { windowsHide: true, stdio: "ignore" },
    );
    const code = await new Promise((res, rej) => {
      child.once("exit", res);
      child.once("error", rej);
    });
    assert.equal(code, 1);
    const identity = await json(serviceFiles(profilePath).identity);
    assert.equal(identity.child, null);
    assert.equal(identity.containment, null);
    await assert.rejects(readFile(output), { code: "ENOENT" });
  },
);

test(
  "a read-only status viewer cannot stop a healthy service",
  options,
  async (t) => {
    const f = await fixture(t),
      a = await f.launch(),
      files = serviceFiles(a.entry.service.profile);
    const reader = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        '$ErrorActionPreference="Stop"; $handle=[IO.File]::Open($env:NAI_SERVICE_STATUS_LOCK,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);try{[Console]::WriteLine("locked");[Console]::In.ReadLine() | Out-Null}finally{$handle.Dispose()}',
      ],
      {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, NAI_SERVICE_STATUS_LOCK: files.status },
      },
    );
    reader.stderr.resume();
    reader.stdin.on("error", () => {});
    t.after(() => {
      if (reader.exitCode === null && reader.signalCode === null) reader.kill();
    });
    await new Promise((res, rej) => {
      let output = "";
      reader.once("error", rej);
      reader.once("exit", () =>
        rej(new Error("Status viewer exited before locking")),
      );
      reader.stdout.on("data", (chunk) => {
        output += chunk;
        if (output.includes("locked")) res();
      });
    });
    await delay(5500);
    const locked = await serviceStatus(a.entry.service.profile);
    assert.equal(locked.live, true);
    assert.equal(locked.child_alive, true);
    assert.equal(locked.status_fresh, false);
    assert.equal(locked.phase, "DIAGNOSTIC_UNAVAILABLE");
    assert.equal(await reachable(a.tree.port), true);
    assert.equal(await reachable(a.tree.descendant.port), true);
    reader.stdin.end("release\n");
    await until(async () => {
      const s = await serviceStatus(a.entry.service.profile);
      return s.status_fresh && s.phase === "RUNNING";
    });
  },
);
