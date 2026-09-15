// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID, createHash } from "node:crypto";
import {
  configureWorker,
  ensureIdentity,
} from "../../packages/contributor/src/configure.mjs";
import {
  validateProfile,
  componentConfigs,
  workerEnvironment,
  verifyPinnedFiles,
} from "../../packages/contributor/src/profile.mjs";
const node = randomUUID();
const settings = {
  schema_version: 1,
  mode: "private_contributor_cpu",
  node: { name: "Fixture", http_port: 43260, backend_model: "fixture" },
  binding: {
    stage_node_id: node,
    route_id: randomUUID(),
    route_sha256: "a".repeat(64),
    manifest_sha256: "b".repeat(64),
  },
  ports: { worker_rpc: 44000, guard_rpc: 44001, control_forward: 44002 },
  control: {
    peer_id: "1".repeat(64),
    peer_addresses: ["127.0.0.1:45000"],
    bind_addr: "127.0.0.1:45001",
  },
  rpc: {
    peer_id: "2".repeat(64),
    peer_addresses: ["127.0.0.1:45002"],
    bind_addr: "127.0.0.1:45003",
  },
  engine: { id: "llama-b10964-win-x64-cpu", directory: "engine" },
  binaries: {
    http: { path: "network-ai-link.exe", sha256: "c".repeat(64) },
    rpc: { path: "network-ai-rpc-link.exe", sha256: "d".repeat(64) },
  },
  threads: 8,
  startup_compute_commands: 4,
};
const invitation = {
  id: node,
  invite: "i".repeat(43),
  operator: { node_kind: "RPC_STAGE", capability_public_key: "k".repeat(43) },
};
async function directory(t) {
  const path = await mkdtemp(join(tmpdir(), "nai-profile-"));
  t.after(async () => {
    assert.ok(
      resolve(path).startsWith(resolve(tmpdir()) + "/") ||
        resolve(path).startsWith(resolve(tmpdir()) + "\\"),
    );
    await rm(path, { recursive: true, force: true });
  });
  return path;
}
test("contributor configuration keeps only its own keys and refuses implicit coordinator fallback or overwrite", async (t) => {
  const dir = await directory(t);
  const identity = await ensureIdentity(dir);
  assert.deepEqual(await ensureIdentity(dir), identity);
  const result = await configureWorker(dir, invitation, settings);
  const c = JSON.parse(await readFile(result.path, "utf8"));
  assert.equal(c.node.id, node);
  assert.deepEqual(await configureWorker(dir, invitation, settings), result);
  await assert.rejects(
    configureWorker(dir, { ...invitation, operator: undefined }, settings),
  );
  await assert.rejects(
    configureWorker(dir, invitation, { ...settings, threads: 9 }),
  );
  assert.equal((await ensureIdentity(dir)).rpc.id, identity.rpc.id);
  const configs = JSON.stringify(componentConfigs(c, "local-state"));
  for (const forbidden of [
    "backend_url",
    "backend_api_key",
    "database_url",
    "admin_password",
    "capability_private_key",
  ])
    assert.ok(!configs.includes(forbidden));
  for (const changed of [
    { ...c, backend_api_key: "no" },
    { ...c, control: { ...c.control, gateway_secret: "no" } },
    { ...c, node: { ...c.node, id: randomUUID() } },
    { ...c, ports: { ...c.ports, guard_rpc: c.ports.worker_rpc } },
    { ...c, rpc: { ...c.rpc, secret_key: c.control.secret_key } },
    { ...c, control: { ...c.control, peer_id: identity.control.id } },
    { ...c, control: { ...c.control, peer_addresses: ["0.0.0.0:45000"] } },
    { ...c, startup_compute_commands: 5 },
    { ...c, threads: 33 },
  ])
    assert.throws(() => validateProfile(changed));
});
test("contributor children do not inherit coordinator keys, Node injection, or proxy variables", () => {
  assert.deepEqual(
    workerEnvironment({
      Path: "test-path",
      SystemRoot: "test-root",
      TEMP: "test-temp",
      NETWORK_AI_CONFIG: "root-secret-file",
      DATABASE_URL: "private",
      NODE_OPTIONS: "--import malicious",
      HTTPS_PROXY: "proxy",
      AWS_SECRET_ACCESS_KEY: "private",
    }),
    {
      Path: "test-path",
      SystemRoot: "test-root",
      TEMP: "test-temp",
      GGML_RPC_NO_RDMA: "1",
    },
  );
});
test("engine verification rejects modified or unexpected loadable files", async (t) => {
  const dir = await directory(t),
    bytes = Buffer.from("not an executable"),
    path = join(dir, "worker.exe");
  const pins = [
    {
      name: "worker.exe",
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
  ];
  await writeFile(path, bytes);
  await verifyPinnedFiles(dir, pins);
  await writeFile(path, Buffer.alloc(bytes.length));
  await assert.rejects(verifyPinnedFiles(dir, pins), {
    code: "worker_engine_pin",
  });
  await writeFile(path, bytes);
  await writeFile(join(dir, "unexpected.dll"), "untrusted");
  await assert.rejects(verifyPinnedFiles(dir, pins), {
    code: "worker_engine_file_set",
  });
});
