// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Socket protocol fixtures, not model or performance evidence.
import { test } from "node:test";
import assert from "node:assert/strict";
import { connect, createServer } from "node:net";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { observeRpc } from "../../scripts/stage-agent.mjs";

class Pull {
  constructor(socket) {
    this.iter = socket[Symbol.asyncIterator]();
    this.pending = Buffer.alloc(0);
  }
  async bytes(n) {
    const parts = [];
    let remaining = n;
    while (remaining > 0) {
      if (!this.pending.length) {
        const next = await this.iter.next();
        if (next.done) throw new Error("end");
        this.pending = next.value;
      }
      const take = Math.min(remaining, this.pending.length);
      parts.push(this.pending.subarray(0, take));
      this.pending = this.pending.subarray(take);
      remaining -= take;
    }
    return Buffer.concat(parts);
  }
}
const request = (command, data = Buffer.alloc(0)) => {
  const b = Buffer.alloc(9);
  b[0] = command;
  b.writeBigUInt64LE(BigInt(data.length), 1);
  return Buffer.concat([b, data]);
};
const response = (data) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(data.length));
  return Buffer.concat([b, data]);
};
async function fixture(t, lease) {
  const sockets = new Set(),
    commands = [],
    errors = [],
    caps = [];
  const settled = Promise.withResolvers();
  const worker = createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
    void (async () => {
      const pull = new Pull(socket),
        hello = await pull.bytes(9);
      assert.equal(hello[0], 14);
      assert.equal(hello.readBigUInt64LE(1), 24n);
      caps.push(await pull.bytes(24));
      const greeting = Buffer.alloc(28, 255);
      greeting[0] = 4;
      socket.write(response(greeting));
      for (;;) {
        const header = await pull.bytes(9),
          cmd = header[0];
        await pull.bytes(Number(header.readBigUInt64LE(1)));
        commands.push(cmd);
        if (cmd === 11) socket.write(response(Buffer.alloc(16, 7)));
        else if (cmd === 15) socket.write(response(Buffer.from([1, 0, 0, 0])));
        else
          assert.ok(
            cmd === 10 || cmd === 16,
            "Unexpected command reached worker",
          );
      }
    })().catch((error) => {
      if (
        error.code !== "ABORT_ERR" &&
        error.message !== "end" &&
        error.code !== "ECONNRESET"
      )
        errors.push(error);
    });
  });
  worker.listen(0, "127.0.0.1");
  await once(worker, "listening");
  let chain = Promise.resolve();
  const serial = (work) => {
    const next = chain.then(work);
    chain = next.catch(() => {});
    return next;
  };
  const relay = createServer((client) => {
    const upstream = connect(worker.address().port, "127.0.0.1");
    sockets.add(client);
    sockets.add(upstream);
    client.on("error", () => {});
    upstream.on("error", () => {});
    void observeRpc(client, upstream, () => lease, serial)
      .then(
        () => settled.resolve(null),
        (error) => settled.resolve(error),
      )
      .finally(() => {
        client.destroy();
        upstream.destroy();
      });
  });
  relay.listen(0, "127.0.0.1");
  await once(relay, "listening");
  const client = connect(relay.address().port, "127.0.0.1");
  sockets.add(client);
  client.on("error", () => {});
  await once(client, "connect");
  const pull = new Pull(client);
  t.after(async () => {
    for (const s of sockets) s.destroy();
    await Promise.all([
      new Promise((r) => relay.close(r)),
      new Promise((r) => worker.close(r)),
    ]);
    assert.deepEqual(errors, []);
  });
  client.write(request(14, Buffer.alloc(24, 255)));
  assert.equal((await pull.bytes(8)).readBigUInt64LE(), 28n);
  const greeting = await pull.bytes(28);
  assert.deepEqual(caps, [Buffer.alloc(24)]);
  assert.deepEqual(greeting.subarray(4), Buffer.alloc(24));
  return { client, pull, commands, settled: settled.promise };
}

test(
  "RPC guard rejects unreserved compute before it reaches the worker",
  { timeout: 5000 },
  async (t) => {
    const f = await fixture(t, null);
    f.client.write(request(10, Buffer.alloc(4)));
    assert.equal((await f.settled).code, "compute_unreserved");
    assert.deepEqual(f.commands, []);
  },
);
test(
  "RPC guard waits for an ordered barrier and counts only claimed compute",
  { timeout: 5000 },
  async (t) => {
    const lease = {
      cap: { exp: Math.floor(Date.now() / 1000) + 60 },
      claimed: true,
      cancelled: false,
      request_bytes: 0,
      response_bytes: 0,
      completed_commands: 0,
      transcript: createHash("sha256"),
    };
    const f = await fixture(t, lease);
    f.client.write(Buffer.concat([request(10, Buffer.alloc(4)), request(15)]));
    assert.equal((await f.pull.bytes(8)).readBigUInt64LE(), 4n);
    assert.deepEqual(await f.pull.bytes(4), Buffer.from([1, 0, 0, 0]));
    assert.deepEqual(f.commands, [10, 11, 15]);
    assert.equal(lease.completed_commands, 1);
    assert.equal(lease.request_bytes, 26);
    assert.equal(lease.response_bytes, 24);
    lease.cancelled = true;
    f.client.write(request(16, Buffer.alloc(4)));
    assert.equal((await f.settled).code, "compute_unreserved");
    assert.equal(lease.completed_commands, 1);
  },
);
test(
  "RPC guard rejects an oversized frame without receiving its body",
  { timeout: 5000 },
  async (t) => {
    const f = await fixture(t, null),
      header = Buffer.alloc(9);
    header[0] = 6;
    header.writeBigUInt64LE(BigInt(1024 ** 3) + 1n, 1);
    f.client.write(header);
    assert.equal((await f.settled).code, "rpc_frame_limit");
    assert.deepEqual(f.commands, []);
  },
);

test(
  "RPC initialization budget cannot silently become unlimited work",
  { timeout: 5000 },
  async (t) => {
    const lease = {
      cap: { exp: Math.floor(Date.now() / 1000) + 60 },
      claimed: true,
      cancelled: false,
      max_commands: 1,
      max_bytes: 256,
      request_bytes: 0,
      response_bytes: 0,
      completed_commands: 0,
      transcript: createHash("sha256"),
    };
    const f = await fixture(t, lease);
    f.client.write(Buffer.concat([request(10, Buffer.alloc(4)), request(15)]));
    await f.pull.bytes(12);
    assert.equal(lease.completed_commands, 1);
    f.client.write(request(10, Buffer.alloc(4)));
    assert.equal((await f.settled).code, "rpc_compute_limit");
    assert.deepEqual(f.commands, [10, 11, 15]);
  },
);
