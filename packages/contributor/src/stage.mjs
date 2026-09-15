// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Trusted loopback RPC stage for the pinned llama.cpp b10964 protocol.
// This observes ordered compute commands, not mathematical correctness.
import { createServer as httpServer } from "node:http";
import { createServer as tcpServer, connect } from "node:net";
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
  verify,
} from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  unlink,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { protectDirectory } from "./permissions.mjs";
import { validateRpcBinding, matchesRpcBinding } from "./rpc-binding.mjs";
import { verifyReadiness } from "./readiness.mjs";
import { z } from "zod";
const hash = (b) => createHash("sha256").update(b).digest("hex");
const nonce = () => randomBytes(32).toString("base64url");
const now = () => Math.floor(Date.now() / 1000);
const hasResponse = new Set([0, 1, 2, 3, 7, 8, 9, 11, 13, 15]);
const MAX_FRAME = 1024 ** 3,
  MAX_SESSION_BYTES = 8 * 1024 ** 3;
function requireValue(value, code = "stage_rejected") {
  if (!value) throw Object.assign(new Error(code), { code });
}
const port = z.coerce.number().int().min(1024).max(65535);

// At most one chunk of retained input plus a 64 KiB forwarding buffer.
class Reader {
  constructor(socket) {
    this.iterator = socket[Symbol.asyncIterator]();
    this.pending = Buffer.alloc(0);
  }
  async read(length) {
    const out = Buffer.alloc(length);
    let offset = 0;
    while (offset < length) {
      if (this.pending.length === 0) {
        const next = await this.iterator.next();
        requireValue(!next.done, "rpc_eof");
        this.pending = next.value;
      }
      const take = Math.min(length - offset, this.pending.length);
      this.pending.copy(out, offset, 0, take);
      this.pending = this.pending.subarray(take);
      offset += take;
    }
    return out;
  }
}
const write = (socket, bytes) =>
  new Promise((res, rej) =>
    socket.write(bytes, (error) => (error ? rej(error) : res())),
  );
async function copy(reader, socket, bytes, digest) {
  for (let remaining = bytes; remaining > 0;) {
    const chunk = await reader.read(Math.min(65536, remaining));
    digest?.update(chunk);
    await write(socket, chunk);
    remaining -= chunk.length;
  }
}
function frameLength(header) {
  const bytes = header.readBigUInt64LE();
  requireValue(bytes <= BigInt(MAX_FRAME), "rpc_frame_limit");
  return Number(bytes);
}

/** A local protocol guard. No WAN listener or arbitrary upstream destination. */
export async function observeRpc(
  client,
  worker,
  leaseForCompute,
  serialize,
  hooks = {},
) {
  const input = new Reader(client),
    output = new Reader(worker);
  const abort = () => {
    client.destroy();
    worker.destroy();
  };
  client.on("timeout", abort);
  worker.on("timeout", abort);
  client.once("close", abort);
  worker.once("close", abort);
  client.setTimeout(5000);
  worker.setTimeout(5000);
  const hello = await input.read(9);
  requireValue(
    hello[0] === 14 && frameLength(hello.subarray(1)) === 24,
    "rpc_handshake",
  );
  await input.read(24);
  // Remove transport-upgrade capabilities in BOTH directions: all bytes must
  // remain on the observed TCP stream, including on an RDMA-capable engine.
  await write(worker, Buffer.concat([hello, Buffer.alloc(24)]));
  const replySize = await output.read(8);
  requireValue(frameLength(replySize) === 28, "rpc_handshake");
  const reply = await output.read(28);
  reply.fill(0, 4);
  await write(client, Buffer.concat([replySize, reply]));
  hooks.handshake?.();
  for (;;) {
    client.setTimeout(0);
    worker.setTimeout(0);
    const commandByte = await input.read(1);
    client.setTimeout(5000);
    const header = Buffer.concat([commandByte, await input.read(8)]),
      command = header[0],
      bytes = frameLength(header.subarray(1));
    requireValue(command <= 17 && command !== 14, "rpc_command");
    await serialize(async () => {
      const computing = command === 10 || command === 16;
      const lease = computing ? leaseForCompute() : null;
      if (computing)
        requireValue(
          lease?.claimed && lease.cap.exp > now() && !lease.cancelled,
          "compute_unreserved",
        );
      const timeout = computing
        ? Math.max(1, Math.min(120000, (lease.cap.exp - now()) * 1000))
        : 120000;
      client.setTimeout(timeout);
      worker.setTimeout(timeout);
      if (computing) {
        requireValue(
          bytes >= 4 &&
            lease.completed_commands < (lease.max_commands ?? 1_000_000) &&
            lease.request_bytes + bytes + 22 <=
              (lease.max_bytes ?? MAX_SESSION_BYTES),
          "rpc_compute_limit",
        );
        const device = await input.read(4);
        requireValue(device.readUInt32LE() === 0, "rpc_device");
        lease.transcript.update(header).update(device);
        await write(worker, header);
        await write(worker, device);
        await copy(input, worker, bytes - 4, lease.transcript);
        // Compute commands have no reply. An ordered device-memory query is a
        // completion barrier; its response belongs to the guard, not the engine.
        const barrier = Buffer.alloc(13);
        barrier[0] = 11;
        barrier.writeBigUInt64LE(4n, 1);
        await write(worker, barrier);
        const size = await output.read(8);
        requireValue(frameLength(size) === 16, "rpc_barrier");
        const ack = await output.read(16);
        lease.transcript.update(barrier).update(size).update(ack);
        lease.request_bytes += bytes + 9 + 13;
        lease.response_bytes += 24;
        lease.completed_commands++;
        requireValue(
          lease.completed_commands <= 1_000_000 &&
            lease.cap.exp > now() &&
            !lease.cancelled,
          "rpc_compute_expired",
        );
      } else {
        await write(worker, header);
        await copy(input, worker, bytes);
        if (hasResponse.has(command)) {
          const size = await output.read(8),
            length = frameLength(size);
          await write(client, size);
          await copy(output, client, length);
        }
      }
    }).catch((error) => {
      error.rpc_command = command;
      throw error;
    });
  }
}

export async function createStageAgent(raw, options) {
  const c = z
    .object({
      mode: z.literal("private_lab"),
      node_kind: z.literal("RPC_STAGE"),
      node_id: z.uuid(),
      node_port: port.min(43103).max(43299),
      node_invite: z.string().min(32),
      node_name: z.string().min(1).max(100),
      control_port: port,
      state_dir: z.string().min(1),
      capability_public_key: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
      readiness_mode: z
        .enum(["local_backend", "coordinator_route_lease"])
        .default("local_backend"),
      backend_url: z.url().optional(),
      backend_model: z.string().min(1).max(200),
      backend_api_key: z.string().min(1).optional(),
    })
    .parse(raw);
  const routeBinding = options.routeBinding
    ? validateRpcBinding(options.routeBinding)
    : null;
  requireValue(
    !routeBinding || routeBinding.stage_node_id === c.node_id,
    "transport_node_binding",
  );
  const portable = c.readiness_mode === "coordinator_route_lease";
  requireValue(
    portable
      ? routeBinding && !c.backend_url && !c.backend_api_key
      : c.backend_url && c.backend_api_key,
    "readiness_configuration",
  );
  const backend = c.backend_url ? new URL(c.backend_url) : null;
  requireValue(
    !backend ||
      (backend.origin === c.backend_url &&
        backend.hostname === "127.0.0.1" &&
        backend.protocol === "http:"),
    "backend_scope",
  );
  const listenPort = port.parse(options.rpcListenPort),
    targetPort = port.parse(options.rpcTargetPort);
  requireValue(
    new Set([
      listenPort,
      targetPort,
      c.node_port,
      c.control_port,
      ...(backend ? [Number(backend.port)] : []),
    ]).size === (backend ? 5 : 4),
    "port_collision",
  );
  const directory = join(resolve(c.state_dir), "stage"),
    outbox = join(directory, "outbox");
  await mkdir(outbox, { recursive: true, mode: 0o700 });
  await protectDirectory(directory);
  const identity = join(directory, "identity.pem");
  let key;
  try {
    key = createPrivateKey(await readFile(identity, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    key = generateKeyPairSync("ed25519").privateKey;
    await writeFile(identity, key.export({ format: "pem", type: "pkcs8" }), {
      flag: "wx",
      mode: 0o600,
    });
  }
  requireValue(key.asymmetricKeyType === "ed25519", "identity_type");
  const publicKey = createPublicKey(key)
    .export({ format: "der", type: "spki" })
    .subarray(-32)
    .toString("base64url");
  const authority = createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      Buffer.from(c.capability_public_key, "base64url"),
    ]),
    format: "der",
    type: "spki",
  });
  const control = `http://127.0.0.1:${c.control_port}/api/v1`,
    boot = randomUUID();
  let epoch = 0,
    ready = false,
    storageHealthy = true,
    prepared = null,
    active = null,
    stopped = false,
    ticking = false,
    connections = 0,
    liveRpc = null,
    readinessLease = null;
  const readyNow = () =>
    Boolean(
      !stopped &&
      ready &&
      (!portable ||
        (liveRpc?.handshake &&
          readinessLease &&
          readinessLease.generation === liveRpc.id &&
          readinessLease.value.expires_ms > Date.now() &&
          readinessLease.until > performance.now())),
    );
  // Explicit operator-funded initialization budget. This is never a paid session
  // and is permanently closed when the backend first becomes ready.
  const startupBudget = z.coerce
    .number()
    .int()
    .min(0)
    .max(16)
    .parse(options.startupComputeCommands ?? 0);
  const startup = {
    claimed: true,
    cap: { exp: now() + 600 },
    cancelled: false,
    max_commands: startupBudget,
    max_bytes: 256 * 1024 ** 2,
    completed_commands: 0,
    request_bytes: 0,
    response_bytes: 0,
    transcript: createHash("sha256"),
  };
  let startupClosed = startupBudget === 0;
  const sockets = new Set();
  let queue = Promise.resolve();
  const serialize = (work) => {
    const next = queue.then(work);
    queue = next.catch(() => {});
    return next;
  };
  async function post(path, body, signed = true) {
    const bytes = Buffer.from(JSON.stringify(body)),
      timestamp = now(),
      n = nonce();
    const route = `/api/v1${path}`;
    const headers = { "Content-Type": "application/json" };
    if (signed) {
      headers["x-node-timestamp"] = String(timestamp);
      headers["x-node-nonce"] = n;
      headers["x-node-signature"] = sign(
        null,
        Buffer.from(
          `network-ai/node/v1\nPOST\n${route}\n${timestamp}\n${n}\n${hash(bytes)}`,
        ),
        key,
      ).toString("base64url");
    }
    const response = await fetch(`http://127.0.0.1:${c.control_port}${route}`, {
      method: "POST",
      headers,
      body: bytes,
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    requireValue(response.ok, "control_rejected");
    return response.json();
  }
  const signed = (path, body) => post(`/nodes/${c.node_id}${path}`, body);
  const pathFor = (id) => join(outbox, `${id}.json`);
  async function deliver(receipt) {
    try {
      const response = await signed("/stage-receipts", receipt);
      if (response.accepted || response.terminal)
        await unlink(pathFor(receipt.session_id)).catch((error) => {
          if (error.code !== "ENOENT") throw error;
        });
      return response;
    } catch {
      return { receipt_pending: true };
    }
  }
  async function finish(id, state = "COMPLETED", code = null) {
    const lease = await serialize(() => {
      if (!active || active.cap.session_id !== id) return null;
      const value = active;
      active = null;
      value.cancelled = true;
      return value;
    });
    if (!lease) return { finished: false };
    const success = state === "COMPLETED" && lease.completed_commands > 0;
    const receipt = {
      session_id: id,
      attempt_id: lease.cap.attempt_id,
      epoch,
      route_sha256: lease.cap.route_sha256,
      state: success ? "COMPLETED" : state === "COMPLETED" ? "FAILED" : state,
      completed_commands: lease.completed_commands,
      request_bytes: String(lease.request_bytes),
      response_bytes: String(lease.response_bytes),
      transcript_sha256: lease.transcript.digest("hex"),
      elapsed_ms: Math.min(3_600_000, Date.now() - lease.started),
      metering_source: "rpc_observed",
      error_code: success ? null : (code ?? "no_compute_observed"),
    };
    try {
      const temporary = pathFor(id) + `.${nonce()}.tmp`;
      await writeFile(temporary, JSON.stringify(receipt) + "\n", {
        flag: "wx",
        mode: 0o600,
        flush: true,
      });
      await rename(temporary, pathFor(id));
    } catch {
      storageHealthy = ready = false;
      throw Object.assign(new Error("receipt_storage"), {
        code: "receipt_storage",
      });
    }
    const settlement = await deliver(receipt);
    return { finished: true, durable: true, ...settlement };
  }
  function cap(request, scope) {
    const token = request.headers.authorization?.replace(/^Bearer /, "") ?? "";
    requireValue(token.length <= 8192, "capability_limit");
    const parts = token.split(".");
    requireValue(
      parts.length === 3 && parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p)),
      "capability_format",
    );
    requireValue(
      verify(
        null,
        Buffer.from(`${parts[0]}.${parts[1]}`),
        authority,
        Buffer.from(parts[2], "base64url"),
      ),
      "capability_signature",
    );
    const header = JSON.parse(Buffer.from(parts[0], "base64url")),
      value = JSON.parse(Buffer.from(parts[1], "base64url"));
    requireValue(
      header.alg === "EdDSA" &&
        header.typ === "NAI-CAP" &&
        header.v === 1 &&
        value.network === "network-ai-private-lab" &&
        value.aud === "network-ai-node" &&
        value.node_id === c.node_id &&
        value.epoch === epoch &&
        value.scope === scope &&
        value.backend_model === c.backend_model &&
        Number.isInteger(value.exp) &&
        value.exp > now() &&
        value.exp <= now() + 190 &&
        z.uuid().safeParse(value.session_id).success &&
        z.uuid().safeParse(value.attempt_id).success &&
        z.uuid().safeParse(value.route_id).success &&
        /^[a-f0-9]{64}$/.test(value.route_sha256),
      "capability_scope",
    );
    requireValue(
      !routeBinding || matchesRpcBinding(routeBinding, value),
      "transport_route_binding",
    );
    return value;
  }
  async function heartbeat() {
    if (prepared?.until <= now()) prepared = null;
    let loaded = false;
    try {
      if (portable) {
        const connection = liveRpc;
        // Keep a still-valid declaration during renewal. Its wall and monotonic
        // deadlines continue to fence admission while the request is in flight.
        if (connection?.handshake) {
          const requestNonce = nonce();
          const response = await signed("/stage-readiness", {
            epoch,
            route_id: routeBinding.route_id,
            route_sha256: routeBinding.route_sha256,
            manifest_sha256: routeBinding.manifest_sha256,
            rpc_generation: connection.id,
            request_nonce: requestNonce,
          });
          if (response.ready) {
            const value = verifyReadiness(response.lease, {
              authority,
              binding: routeBinding,
              epoch,
              generation: connection.id,
              nonce: requestNonce,
            });
            requireValue(
              liveRpc === connection && connection.handshake,
              "rpc_generation_changed",
            );
            readinessLease = {
              value,
              generation: connection.id,
              until:
                performance.now() +
                Math.min(4000, value.expires_ms - Date.now()),
            };
            loaded = value.expires_ms > Date.now();
          } else readinessLease = null;
        } else readinessLease = null;
      } else {
        const r = await fetch(c.backend_url + "/v1/models", {
          headers: { Authorization: `Bearer ${c.backend_api_key}` },
          redirect: "error",
          signal: AbortSignal.timeout(3000),
        });
        const data = r.ok ? await r.json() : {};
        loaded =
          connections > 0 &&
          Array.isArray(data.data) &&
          data.data.some((m) => m.id === c.backend_model);
      }
    } catch {
      if (portable) readinessLease = null;
      /* An unavailable backend does not become READY. */
    }
    if (loaded && !startupClosed) {
      startupClosed = true;
      console.log(
        JSON.stringify({
          event: "startup_budget_closed",
          completed_commands: startup.completed_commands,
          billable: false,
        }),
      );
    }
    const r = await signed("/heartbeat", {
      boot_id: boot,
      epoch,
      state: loaded && storageHealthy ? "READY" : "VALIDATING",
      loaded_backend_models: loaded && storageHealthy ? [c.backend_model] : [],
      running_sessions: active ? [active.cap.session_id] : [],
      inventory: {
        os: process.platform,
        gpu_name: null,
        memory_total_mib: null,
        memory_free_mib: null,
        physical_domain_hint:
          "operator-assigned CPU RPC stage; same-host is not independent hardware",
      },
    });
    ready =
      loaded &&
      storageHealthy &&
      r.desired_state === "READY" &&
      r.state === "READY";
    if (active && r.cancel_sessions?.includes(active.cap.session_id))
      await finish(active.cap.session_id, "CANCELLED", "cancelled");
  }
  const rpc = tcpServer({ noDelay: true }, (client) => {
    if (stopped || connections >= 1) {
      client.destroy();
      return;
    }
    connections++;
    const connection = { id: randomUUID(), handshake: false };
    liveRpc = connection;
    readinessLease = null;
    sockets.add(client);
    const worker = connect({
      host: "127.0.0.1",
      port: targetPort,
      noDelay: true,
    });
    sockets.add(worker);
    client.on("error", () => {});
    worker.on("error", () => {});
    void observeRpc(
      client,
      worker,
      () => active ?? (!startupClosed ? startup : null),
      serialize,
      {
        handshake: () => {
          connection.handshake = true;
        },
      },
    )
      .catch(async (error) => {
        // Operation identifiers only: never record tensor data, capabilities,
        // prompts, outputs or credentials in protocol diagnostics.
        console.error(
          JSON.stringify({
            event: "rpc_guard_closed",
            command: Number.isInteger(error.rpc_command)
              ? error.rpc_command
              : null,
            reason: /^[a-z_]{1,60}$/.test(error.code ?? "")
              ? error.code
              : "rpc_io_failure",
          }),
        );
        ready = false;
        prepared = null;
        readinessLease = null;
        if (active)
          await finish(
            active.cap.session_id,
            "FAILED",
            "rpc_link_failed",
          ).catch(() => {});
      })
      .finally(() => {
        client.destroy();
        worker.destroy();
        sockets.delete(client);
        sockets.delete(worker);
        connections--;
        if (liveRpc === connection) liveRpc = null;
      });
  });
  const health = () => ({
    status: "ok",
    mode: "private_lab",
    component: "rpc_stage",
    node_id: c.node_id,
    epoch,
    ready: readyNow() && api.listening && rpc.listening,
    running: active ? 1 : 0,
    startup_compute_commands: startup.completed_commands,
    startup_budget_closed: startupClosed,
    rpc_route_bound: routeBinding !== null,
    readiness_source: c.readiness_mode,
    readiness_expires_ms: portable
      ? (readinessLease?.value.expires_ms ?? null)
      : null,
  });
  const api = httpServer(
    { maxHeaderSize: 8192, requestTimeout: 10000, headersTimeout: 5000 },
    async (req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      try {
        if (req.method === "GET" && req.url === "/health") {
          res.end(JSON.stringify(health()));
          return;
        }
        requireValue(
          req.method === "POST" &&
            ["/prepare", "/release", "/stage/start", "/stage/finish"].includes(
              req.url,
            ),
          "route_missing",
        );
        let bytes = 0,
          body = "";
        for await (const chunk of req) {
          bytes += chunk.length;
          requireValue(bytes <= 2048, "request_limit");
          body += chunk;
        }
        const data = JSON.parse(body || "{}");
        let result;
        if (req.url === "/prepare") {
          const value = cap(req, "stage_prepare");
          if (prepared?.until <= now()) prepared = null;
          requireValue(
            readyNow() && storageHealthy && !active,
            "stage_not_ready",
          );
          requireValue(
            !prepared ||
              (prepared.cap.session_id === value.session_id &&
                prepared.cap.attempt_id === value.attempt_id),
            "stage_busy",
          );
          prepared ??= {
            cap: value,
            id: nonce(),
            until: Math.min(now() + 15, value.exp),
          };
          result = { prepare_id: prepared.id };
        } else if (req.url === "/release") {
          const value = cap(req, "stage_prepare");
          if (
            prepared?.cap.session_id === value.session_id &&
            prepared.cap.attempt_id === value.attempt_id
          )
            prepared = null;
          result = { released: true };
        } else if (req.url === "/stage/start") {
          const value = cap(req, "stage_execute");
          requireValue(
            readyNow() &&
              !active &&
              prepared &&
              prepared.until > now() &&
              value.prepare_id === prepared.id &&
              value.session_id === prepared.cap.session_id &&
              value.attempt_id === prepared.cap.attempt_id &&
              value.route_sha256 === prepared.cap.route_sha256,
            "stage_prepare",
          );
          // Reserve locally before the awaited claim to exclude concurrent starts.
          const lease = {
            cap: value,
            started: Date.now(),
            cancelled: false,
            completed_commands: 0,
            request_bytes: 0,
            response_bytes: 0,
            transcript: createHash("sha256"),
          };
          active = lease;
          prepared = null;
          try {
            await signed("/stage-claim", {
              session_id: value.session_id,
              attempt_id: value.attempt_id,
              epoch,
              prepare_id: value.prepare_id,
            });
            lease.claimed = true;
          } catch (error) {
            if (active === lease) active = null;
            throw error;
          }
          result = { started: true };
        } else {
          const value = cap(req, "stage_finish"),
            state = z
              .enum(["COMPLETED", "FAILED", "CANCELLED"])
              .parse(data.state);
          requireValue(
            !active ||
              (active.cap.session_id === value.session_id &&
                active.cap.attempt_id === value.attempt_id),
            "stage_identity",
          );
          result = await finish(
            value.session_id,
            state,
            state === "COMPLETED" ? null : "route_interrupted",
          );
        }
        res.end(JSON.stringify(result));
      } catch (error) {
        res.statusCode = error.code === "route_missing" ? 404 : 409;
        res.end(
          JSON.stringify({
            error: {
              code: error.code ?? "stage_rejected",
              message: "Private stage request rejected.",
            },
          }),
        );
      }
    },
  );
  async function stop() {
    if (stopped) return;
    stopped = true;
    ready = false;
    clearInterval(timer);
    for (const socket of sockets) socket.destroy();
    if (active)
      await finish(
        active.cap.session_id,
        "INTERRUPTED",
        "operator_shutdown",
      ).catch(() => {});
    await Promise.all([
      new Promise((r) => api.close(r)),
      new Promise((r) => rpc.close(r)),
    ]);
  }
  let timer;
  try {
    let registration;
    try {
      registration = await signed("/resume", { boot_id: boot });
    } catch {
      const timestamp = now(),
        n = nonce();
      const message = `network-ai/register/v1\n${hash(c.node_invite)}\n${n}\n${publicKey}\n${boot}\n${timestamp}`;
      registration = await post(
        "/nodes/register",
        {
          invite: c.node_invite,
          name: c.node_name,
          public_key: publicKey,
          nonce: n,
          timestamp,
          signature: sign(null, Buffer.from(message), key).toString(
            "base64url",
          ),
          boot_id: boot,
        },
        false,
      );
    }
    requireValue(
      registration.id === c.node_id &&
        Number.isInteger(registration.epoch) &&
        registration.epoch > 0,
      "registration_identity",
    );
    epoch = registration.epoch;
    await Promise.all([
      new Promise((r, j) => {
        rpc.once("error", j);
        rpc.listen(listenPort, "127.0.0.1", r);
      }),
      new Promise((r, j) => {
        api.once("error", j);
        api.listen(c.node_port, "127.0.0.1", r);
      }),
    ]);
    await heartbeat();
    timer = setInterval(() => {
      if (ticking || stopped) return;
      ticking = true;
      void (async () => {
        if (active && active.cap.exp <= now())
          await finish(
            active.cap.session_id,
            "INTERRUPTED",
            "execution_timeout",
          );
        await heartbeat();
        for (const file of (await readdir(outbox))
          .filter((n) => /^[a-f0-9-]{36}\.json$/.test(n))
          .slice(0, 100))
          await deliver(JSON.parse(await readFile(join(outbox, file), "utf8")));
      })()
        .catch(() => {
          ready = false;
        })
        .finally(() => {
          ticking = false;
        });
    }, 2000);
    return { stop, health, nodePort: c.node_port, rpcListenPort: listenPort };
  } catch (error) {
    await stop();
    throw error;
  }
}

export async function runStageCli() {
  const { values: a } = parseArgs({
    options: {
      config: { type: "string" },
      "rpc-listen-port": { type: "string" },
      "rpc-target-port": { type: "string" },
      "startup-compute-commands": { type: "string" },
      "route-binding": { type: "string" },
    },
  });
  requireValue(
    a.config && a["rpc-listen-port"] && a["rpc-target-port"],
    "stage_arguments",
  );
  const agent = await createStageAgent(
    JSON.parse(await readFile(resolve(a.config), "utf8")),
    {
      rpcListenPort: a["rpc-listen-port"],
      rpcTargetPort: a["rpc-target-port"],
      startupComputeCommands: a["startup-compute-commands"],
      routeBinding: a["route-binding"]
        ? JSON.parse(await readFile(resolve(a["route-binding"]), "utf8"))
        : undefined,
    },
  );
  console.log(
    `Private RPC stage listening on 127.0.0.1:${agent.nodePort}; session compute requires a route capability.`,
  );
  process.on("SIGINT", () => void agent.stop());
  process.on("SIGTERM", () => void agent.stop());
  process.stdin.on("data", (chunk) => {
    if (chunk.length <= 16 && chunk.toString().trim() === "stop")
      void agent.stop();
  });
}
