// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Private socket/configuration fixtures; no model, independent operator or WAN evidence.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createServer as tcpServer } from "node:net";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ensureRpcIdentity, configureRpc } from "../../scripts/rpc-config.mjs";
import { createStageAgent } from "../../scripts/stage-agent.mjs";

async function temporary(t) {
  const parent = resolve(".runtime");
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, "rpc-test-"));
  assert.ok(
    directory.startsWith(parent + (process.platform === "win32" ? "\\" : "/")),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
const binding = () => ({
  stage_node_id: randomUUID(),
  route_id: randomUUID(),
  route_sha256: "a".repeat(64),
  manifest_sha256: "b".repeat(64),
});
async function port() {
  const s = tcpServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const n = s.address().port;
  await new Promise((r) => s.close(r));
  return n;
}
test("RPC profiles preserve private identity and reject changed peer, binding or target without overwrite", async (t) => {
  const directory = await temporary(t),
    a = join(directory, "a"),
    b = join(directory, "b");
  const first = await ensureRpcIdentity(a),
    peer = await ensureRpcIdentity(b);
  assert.deepEqual(await ensureRpcIdentity(a), first);
  assert.deepEqual(Object.keys(first).sort(), ["id", "schema_version"]);
  const options = {
    directory: a,
    role: "root",
    binding: binding(),
    peer,
    peerAddress: "127.0.0.1:45001",
    bind: "127.0.0.1:45002",
    localPort: 45003,
  };
  await configureRpc(options);
  await configureRpc(options);
  const before = await readFile(join(a, "rpc.json"), "utf8");
  for (const changed of [
    { ...options, localPort: 45004 },
    { ...options, peer: first },
    { ...options, binding: { ...options.binding, route_id: randomUUID() } },
    { ...options, peerAddress: "0.0.0.0:45001" },
  ])
    await assert.rejects(configureRpc(changed));
  assert.ok(
    before === (await readFile(join(a, "rpc.json"), "utf8")),
    "Rejected configuration must preserve existing bytes",
  );
});

test("a signed stage capability is rejected when it differs from the transport's route or manifest", async (t) => {
  const directory = await temporary(t),
    b = binding();
  const authority = generateKeyPairSync("ed25519");
  const control = createServer((req, res) => {
    req.resume();
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify(
        req.url.endsWith("/heartbeat")
          ? { state: "READY", desired_state: "READY", cancel_sessions: [] }
          : { id: b.stage_node_id, epoch: 1 },
      ),
    );
  });
  const backend = createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end('{"data":[]}');
  });
  await new Promise((r) => control.listen(0, "127.0.0.1", r));
  await new Promise((r) => backend.listen(0, "127.0.0.1", r));
  t.after(() =>
    Promise.all([
      new Promise((r) => control.close(r)),
      new Promise((r) => backend.close(r)),
    ]),
  );
  let nodePort;
  for (let p = 43180; p < 43210; p++) {
    const listener = tcpServer();
    const available = await new Promise((r) => {
      listener.once("error", () => r(false));
      listener.listen(p, "127.0.0.1", () => r(true));
    });
    if (available) {
      await new Promise((r) => listener.close(r));
      nodePort = p;
      break;
    }
  }
  assert.ok(nodePort);
  const agent = await createStageAgent(
    {
      mode: "private_lab",
      node_kind: "RPC_STAGE",
      node_id: b.stage_node_id,
      node_port: nodePort,
      node_invite: "fixture".repeat(8),
      node_name: "Bound RPC fixture",
      control_port: control.address().port,
      state_dir: directory,
      capability_public_key: authority.publicKey.export({ format: "jwk" }).x,
      backend_url: `http://127.0.0.1:${backend.address().port}`,
      backend_model: "fixture-model",
      backend_api_key: "fixture-key",
    },
    {
      rpcListenPort: await port(),
      rpcTargetPort: await port(),
      routeBinding: b,
    },
  );
  t.after(() => agent.stop());
  const base = {
    network: "network-ai-private-lab",
    aud: "network-ai-node",
    node_id: b.stage_node_id,
    epoch: 1,
    scope: "stage_prepare",
    backend_model: "fixture-model",
    exp: Math.floor(Date.now() / 1000) + 120,
    session_id: randomUUID(),
    attempt_id: randomUUID(),
    route_id: b.route_id,
    route_sha256: b.route_sha256,
    manifest_sha256: b.manifest_sha256,
  };
  async function request(value) {
    const head = Buffer.from(
      JSON.stringify({ alg: "EdDSA", typ: "NAI-CAP", v: 1 }),
    ).toString("base64url");
    const body = Buffer.from(JSON.stringify(value)).toString("base64url"),
      signed = `${head}.${body}`;
    return fetch(`http://127.0.0.1:${nodePort}/release`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${signed}.${sign(null, Buffer.from(signed), authority.privateKey).toString("base64url")}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(3000),
    });
  }
  assert.equal((await request(base)).status, 200);
  for (const change of [
    { route_id: randomUUID() },
    { route_sha256: "c".repeat(64) },
    { manifest_sha256: "d".repeat(64) },
    { manifest_sha256: undefined },
  ]) {
    const response = await request({ ...base, ...change });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, "transport_route_binding");
  }
  assert.equal((await request(base)).status, 200);
});
