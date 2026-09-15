// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join, dirname, resolve, basename } from "node:path";
import { tmpdir } from "node:os";
import {
  atomicJson,
  StatusPublisher,
} from "../../packages/contributor/src/state.mjs";
const io = (code, operation = "replace") =>
  Object.assign(
    new Error("private filesystem details must not enter diagnostics"),
    { code, atomic_operation: operation },
  );
test("a status sharing lock degrades telemetry without killing work and recovery is reported", async () => {
  let failure = io("EPERM");
  const diagnostics = [];
  const publisher = new StatusPublisher("private-file", {
    diagnostic: (v) => diagnostics.push(v),
    write: async () => {
      if (failure) throw failure;
    },
  });
  assert.equal(await publisher.publish({ ready: true }), false);
  assert.equal(await publisher.publish({ ready: true }), false);
  failure = null;
  assert.equal(await publisher.publish({ ready: true }), true);
  assert.deepEqual(diagnostics, [
    { event: "worker_status_degraded", code: "EPERM", operation: "replace" },
    { event: "worker_status_recovered" },
  ]);
  failure = io("EBUSY");
  assert.equal(await publisher.publish({ ready: true }), false);
});
test("only a replacement sharing failure is tolerated; actual write or cleanup failure fails closed", async () => {
  let operation = "replace";
  const publisher = new StatusPublisher("private-file", {
    diagnostic: () => {},
    write: async () => {
      throw io("EACCES", operation);
    },
  });
  assert.equal(await publisher.publish({ ready: true }), false);
  assert.equal(await publisher.publish({ ready: true }), false);
  for (operation of ["write", "cleanup", "unknown"])
    await assert.rejects(publisher.publish({ ready: true }), {
      code: "worker_status_unavailable",
      io_code: "EACCES",
    });
  const disk = new StatusPublisher("private-file", {
    diagnostic: () => {},
    write: async () => {
      throw io("ENOSPC", "write");
    },
  });
  await assert.rejects(disk.publish({ ready: true }), {
    code: "worker_status_unavailable",
    io_code: "ENOSPC",
  });
});
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "nai-state-"));
  t.after(async () => {
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    assert.ok(basename(dir).startsWith("nai-state-"));
    await rm(dir, { recursive: true, force: true });
  });
  return dir;
}
test("atomic status/stop replacement keeps complete JSON under concurrent readers", async (t) => {
  const dir = await fixture(t),
    file = join(dir, "state.json");
  const payload = (index) => ({
    boot_id: "fixture",
    index,
    filler: "x".repeat(16384),
  });
  await atomicJson(file, payload(0));
  const publisher = new StatusPublisher(file, { diagnostic: () => {} });
  let writing = true,
    reads = 0;
  const reader = (async () => {
    while (writing) {
      const v = JSON.parse(await readFile(file, "utf8"));
      assert.ok(Number.isInteger(v.index));
      assert.equal(v.filler.length, 16384);
      reads++;
    }
  })();
  try {
    // A continuous Windows reader may legitimately deny rename. StatusPublisher
    // reports that degradation; every observed document must still be complete.
    for (let i = 1; i <= 8; i++) await publisher.publish(payload(i));
  } finally {
    writing = false;
    await reader;
  }
  assert.ok(reads > 0);
  await publisher.publish(payload(20));
  assert.equal(JSON.parse(await readFile(file, "utf8")).index, 20);
  assert.deepEqual(await readdir(dir), ["state.json"]);
});
test("failed serialization preserves the last status and leaves no temporary file", async (t) => {
  const dir = await fixture(t),
    file = join(dir, "state.json");
  await atomicJson(file, { value: "last complete status" });
  const circular = {};
  circular.self = circular;
  await assert.rejects(atomicJson(file, circular));
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), {
    value: "last complete status",
  });
  assert.deepEqual(await readdir(dir), ["state.json"]);
});
