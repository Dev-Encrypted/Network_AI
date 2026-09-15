// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Actual local TCP streams with a fabricated allocator, not GPU evidence.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, connect } from "node:net";
import { once } from "node:events";
import { observeRpc } from "../../packages/contributor/src/stage.mjs";
import { RpcMemoryBudget } from "../../packages/contributor/src/rpc-memory.mjs";

const frame = (command, body = Buffer.alloc(0)) => {
  const header = Buffer.alloc(9);
  header[0] = command;
  header.writeBigUInt64LE(BigInt(body.length), 1);
  return Buffer.concat([header, body]);
};
const device = () => Buffer.alloc(4);
function allocation(size, id = 0) {
  const b = Buffer.alloc(12);
  b.writeUInt32LE(id);
  b.writeBigUInt64LE(BigInt(size), 4);
  return b;
}
async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}
async function fixture(t, options = {}) {
  const sockets = new Set(),
    commands = [],
    allocated = new Map();
  const failures = Promise.withResolvers();
  const budget = new RpcMemoryBudget({
    limit_bytes: "1024",
    reserve_bytes: "128",
  });
  let counter = 1n;
  const backend = createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
    let bytes = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      bytes = Buffer.concat([bytes, chunk]);
      while (bytes.length >= 9) {
        const length = Number(bytes.readBigUInt64LE(1));
        if (bytes.length < 9 + length) return;
        const command = bytes[0],
          request = bytes.subarray(9, 9 + length);
        bytes = bytes.subarray(9 + length);
        commands.push(command);
        let reply;
        if (command === 14) {
          reply = Buffer.alloc(28);
          reply[0] = 4;
        } else if (command === 15) {
          reply = Buffer.alloc(4);
          reply.writeUInt32LE(options.devices ?? 1);
        } else if (command === 11) {
          reply = Buffer.alloc(16);
          reply.writeBigUInt64LE(BigInt(options.free ?? 8192));
          reply.writeBigUInt64LE(8192n, 8);
        } else if (command === 2) {
          reply = Buffer.alloc(8);
          reply.writeBigUInt64LE(0xffffffffffffffffn);
        } else if (command === 0) {
          const requested = Number(request.readBigUInt64LE(4));
          const size = BigInt(options.actual ?? Math.ceil(requested / 32) * 32);
          const pointer = counter++;
          allocated.set(pointer, size);
          reply = Buffer.alloc(16);
          reply.writeBigUInt64LE(pointer);
          reply.writeBigUInt64LE(size, 8);
        } else if (command === 4) {
          allocated.delete(request.readBigUInt64LE());
          continue;
        } else throw new Error(`Unexpected fixture command ${command}`);
        const size = Buffer.alloc(8);
        size.writeBigUInt64LE(BigInt(reply.length));
        socket.write(Buffer.concat([size, reply]));
      }
    });
  });
  const backendPort = await listen(backend);
  const guard = createServer((socket) => {
    const worker = connect(backendPort, "127.0.0.1");
    for (const s of [socket, worker]) {
      sockets.add(s);
      s.on("error", () => {});
    }
    void observeRpc(
      socket,
      worker,
      () => null,
      (f) => f(),
      { memoryBudget: budget, memoryFreeBytes: options.freeBytes },
    )
      .catch((e) => failures.resolve(e.code))
      .finally(() => {
        socket.destroy();
        worker.destroy();
      });
  });
  const guardPort = await listen(guard),
    client = connect(guardPort, "127.0.0.1");
  sockets.add(client);
  client.on("error", () => {});
  t.after(async () => {
    for (const s of sockets) s.destroy();
    await Promise.all(
      [backend, guard].map((s) => new Promise((r) => s.close(r))),
    );
  });
  await once(client, "connect");
  const iterator = client[Symbol.asyncIterator]();
  let pending = Buffer.alloc(0);
  async function read(n) {
    while (pending.length < n) {
      const next = await iterator.next();
      assert.equal(next.done, false);
      pending = Buffer.concat([pending, next.value]);
    }
    const result = pending.subarray(0, n);
    pending = pending.subarray(n);
    return result;
  }
  async function request(command, body) {
    client.write(frame(command, body));
    const size = await read(8);
    return read(Number(size.readBigUInt64LE()));
  }
  await request(14, Buffer.alloc(24));
  return {
    client,
    request,
    budget,
    commands,
    allocated,
    failure: failures.promise,
  };
}

test(
  "RPC memory reports only the offered budget and returns freed allocation capacity",
  { timeout: 5000 },
  async (t) => {
    const f = await fixture(t);
    let memory = await f.request(11, device());
    assert.equal(memory.readBigUInt64LE(), 1024n);
    assert.equal(memory.readBigUInt64LE(8), 1024n);
    assert.equal((await f.request(2, device())).readBigUInt64LE(), 1024n);
    const buffer = await f.request(0, allocation(500));
    assert.equal(buffer.readBigUInt64LE(8), 512n);
    memory = await f.request(11, device());
    assert.equal(memory.readBigUInt64LE(), 512n);
    f.client.write(frame(4, buffer.subarray(0, 8)));
    memory = await f.request(11, device());
    assert.equal(memory.readBigUInt64LE(), 1024n);
    assert.equal(f.allocated.size, 0);
    assert.equal(f.budget.snapshot().peak_allocated_bytes, "512");
    assert.equal(f.budget.snapshot().allocated_bytes, "0");
  },
);
test(
  "an over-budget allocation never reaches the worker",
  { timeout: 5000 },
  async (t) => {
    const f = await fixture(t);
    f.client.write(frame(0, allocation(1025)));
    assert.equal(await f.failure, "rpc_buffer_budget");
    assert.equal(f.commands.includes(0), false);
    assert.equal(f.allocated.size, 0);
  },
);
test(
  "fresh worker memory must leave the operator reserve before allocation",
  { timeout: 5000 },
  async (t) => {
    const f = await fixture(t, { free: 256 });
    const memory = await f.request(11, device());
    assert.equal(memory.readBigUInt64LE(), 128n);
    f.client.write(frame(0, allocation(129)));
    assert.equal(await f.failure, "rpc_memory_headroom");
    assert.equal(f.commands.includes(0), false);
  },
);
test(
  "unexpected backend allocation growth closes the guarded stream",
  { timeout: 5000 },
  async (t) => {
    const f = await fixture(t, { actual: 2048 });
    f.client.write(frame(0, allocation(512)));
    assert.equal(await f.failure, "rpc_buffer_budget");
    assert.equal(f.budget.snapshot().allocated_bytes, "0");
    assert.equal(f.commands.filter((c) => c === 0).length, 1);
  },
);
test(
  "driver memory bounds an optimistic backend and probe failure fails closed",
  { timeout: 5000 },
  async (t) => {
    let physical = 300n;
    const f = await fixture(t, { freeBytes: async () => physical });
    assert.equal((await f.request(11, device())).readBigUInt64LE(), 172n);
    physical = 200n;
    f.client.write(frame(0, allocation(100)));
    assert.equal(await f.failure, "rpc_memory_headroom");
    assert.equal(f.commands.includes(0), false);
    const unavailable = await fixture(t, {
      freeBytes: async () => {
        throw Object.assign(new Error("probe"), {
          code: "worker_gpu_inventory_unavailable",
        });
      },
    });
    unavailable.client.write(frame(0, allocation(100)));
    assert.equal(await unavailable.failure, "worker_gpu_inventory_unavailable");
    assert.equal(unavailable.commands.includes(0), false);
  },
);

test(
  "a second exposed device is rejected instead of silently sharing it",
  { timeout: 5000 },
  async (t) => {
    const f = await fixture(t, { devices: 2 });
    f.client.write(frame(15));
    assert.equal(await f.failure, "rpc_device_count");
    assert.equal(f.allocated.size, 0);
  },
);
test(
  "unknown frees and a different device cannot alter worker allocations",
  { timeout: 5000 },
  async (t) => {
    const wrongDevice = await fixture(t);
    wrongDevice.client.write(frame(0, allocation(256, 1)));
    assert.equal(await wrongDevice.failure, "rpc_device");
    assert.equal(wrongDevice.commands.includes(0), false);
    const wrongFree = await fixture(t);
    wrongFree.client.write(frame(4, Buffer.alloc(8)));
    assert.equal(await wrongFree.failure, "rpc_buffer_unknown");
    assert.equal(wrongFree.commands.includes(4), false);
  },
);
