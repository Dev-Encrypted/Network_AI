// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Real local sockets with a fabricated coordinator; not model/hardware evidence.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer as httpServer } from "node:http";
import { createServer as tcpServer, connect } from "node:net";
import { once } from "node:events";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign,
  verify,
} from "node:crypto";
import { createStageAgent } from "../../packages/contributor/src/stage.mjs";

async function waitFor(probe, timeout = 6000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await probe();
    if (value) return value;
    await delay(25);
  }
  throw new Error("Stage condition did not become true");
}
async function listen(server, port = 0) {
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}
async function freePort() {
  const s = tcpServer();
  const port = await listen(s);
  await new Promise((r) => s.close(r));
  return port;
}
async function stagePort() {
  for (let port = 43270; port <= 43299; port++) {
    const server = tcpServer();
    try {
      await listen(server, port);
      await new Promise((r) => server.close(r));
      return port;
    } catch {
      server.close();
    }
  }
  throw new Error("No fixture port available");
}
test(
  "portable stage needs a live handshake and current signed declaration without a backend key",
  { timeout: 18000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "nai-stage-"));
    const keys = generateKeyPairSync("ed25519"),
      rootBoot = randomUUID(),
      rootNode = randomUUID();
    const binding = {
      stage_node_id: randomUUID(),
      route_id: randomUUID(),
      route_sha256: "a".repeat(64),
      manifest_sha256: "b".repeat(64),
    };
    const sockets = new Set(),
      declarations = [],
      signedPaths = [],
      errors = [];
    let replay = false,
      lastLease,
      agent;
    const control = httpServer(async (req, res) => {
      try {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const bytes = Buffer.concat(chunks),
          body = JSON.parse(bytes);
        const identity = createPublicKey(
          await readFile(join(directory, "stage/identity.pem")),
        );
        const canonical = `network-ai/node/v1\nPOST\n${req.url}\n${req.headers["x-node-timestamp"]}\n${req.headers["x-node-nonce"]}\n${createHash("sha256").update(bytes).digest("hex")}`;
        assert.ok(
          verify(
            null,
            Buffer.from(canonical),
            identity,
            Buffer.from(req.headers["x-node-signature"], "base64url"),
          ),
        );
        signedPaths.push(req.url);
        let value;
        if (req.url.endsWith("/resume"))
          value = { id: binding.stage_node_id, epoch: 3 };
        else if (req.url.endsWith("/heartbeat"))
          value = { state: body.state, desired_state: "READY" };
        else if (req.url.endsWith("/stage-readiness")) {
          declarations.push(body);
          const now = Date.now();
          const payload = {
            network: "network-ai-private-lab",
            aud: "network-ai-rpc-stage-readiness",
            version: 1,
            ...binding,
            stage_epoch: 3,
            root_node_id: rootNode,
            root_epoch: 2,
            root_boot_id: rootBoot,
            root_seen_ms: now,
            issued_ms: now,
            expires_ms: now + 1200,
            rpc_generation: body.rpc_generation,
            request_nonce: body.request_nonce,
          };
          const message = [{ alg: "EdDSA", typ: "NAI-READY", v: 1 }, payload]
            .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
            .join(".");
          if (!replay)
            lastLease = `${message}.${sign(null, Buffer.from(message), keys.privateKey).toString("base64url")}`;
          value = { ready: true, lease: lastLease };
        } else throw new Error("Unexpected coordinator operation");
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(value));
      } catch (e) {
        errors.push(e);
        res.statusCode = 500;
        res.end("{}");
      }
    });
    const worker = tcpServer((socket) => {
      sockets.add(socket);
      socket.on("error", () => {});
      let buffer = Buffer.alloc(0),
        greeted = false;
      socket.on("data", (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        if (!greeted && buffer.length >= 33) {
          assert.equal(buffer[0], 14);
          greeted = true;
          const reply = Buffer.alloc(36);
          reply.writeBigUInt64LE(28n);
          reply[8] = 4;
          socket.write(reply);
        }
      });
    });
    const controlPort = await listen(control),
      workerPort = await listen(worker),
      guardPort = await freePort(),
      httpPort = await stagePort();
    t.after(async () => {
      await agent?.stop();
      for (const s of sockets) s.destroy();
      control.closeAllConnections();
      await Promise.all([
        new Promise((r) => control.close(r)),
        new Promise((r) => worker.close(r)),
      ]);
      assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
      assert.ok(basename(directory).startsWith("nai-stage-"));
      await rm(directory, { recursive: true, force: true });
      assert.deepEqual(errors, []);
    });
    agent = await createStageAgent(
      {
        mode: "private_lab",
        node_kind: "RPC_STAGE",
        node_id: binding.stage_node_id,
        node_port: httpPort,
        node_invite: "i".repeat(43),
        node_name: "Portable contract fixture",
        control_port: controlPort,
        state_dir: directory,
        capability_public_key: keys.publicKey
          .export({ format: "der", type: "spki" })
          .subarray(-32)
          .toString("base64url"),
        readiness_mode: "coordinator_route_lease",
        backend_model: "fixture",
      },
      {
        rpcListenPort: guardPort,
        rpcTargetPort: workerPort,
        routeBinding: binding,
      },
    );
    const health = async () =>
      (await fetch(`http://127.0.0.1:${httpPort}/health`)).json();
    assert.equal((await health()).ready, false);
    assert.equal(declarations.length, 0);
    async function greet() {
      const socket = connect(guardPort, "127.0.0.1");
      sockets.add(socket);
      socket.on("error", () => {});
      await once(socket, "connect");
      const reply = once(socket, "data");
      const hello = Buffer.alloc(33);
      hello[0] = 14;
      hello.writeBigUInt64LE(24n, 1);
      socket.write(hello);
      await reply;
      return socket;
    }
    const first = await greet();
    await waitFor(async () => (await health()).ready);
    assert.equal((await health()).readiness_source, "coordinator_route_lease");
    const generation = declarations[0].rpc_generation;
    replay = true;
    await waitFor(async () => !(await health()).ready); // expiry fences before next heartbeat
    await waitFor(() => declarations.length >= 2);
    assert.equal((await health()).ready, false);
    assert.notEqual(
      declarations[0].request_nonce,
      declarations[1].request_nonce,
    );
    first.destroy();
    await delay(100);
    const second = await greet();
    await waitFor(() =>
      declarations.some((d) => d.rpc_generation !== generation),
    );
    assert.equal((await health()).ready, false);
    replay = false;
    await waitFor(async () => (await health()).ready);
    second.destroy();
    await waitFor(async () => !(await health()).ready);
    assert.ok(
      signedPaths.every((p) => /\/(resume|heartbeat|stage-readiness)$/.test(p)),
    );
  },
);
