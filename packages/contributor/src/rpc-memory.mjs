// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// The b10964 wire allocator is bounded separately from paid graph execution.
// This limits observed backend buffers, not CUDA context/scratch or OS memory.
const supported = new Set([0, 2, 4, 11, 15]);
const lengths = new Map([
  [0, 12],
  [2, 4],
  [4, 8],
  [11, 4],
  [15, 0],
]);
const min = (...values) => values.reduce((a, b) => (a < b ? a : b));
function requireValue(value, code) {
  if (!value) throw Object.assign(new Error(code), { code });
}

export class RpcMemoryBudget {
  constructor({ limit_bytes, reserve_bytes }) {
    requireValue(
      typeof limit_bytes === "string" &&
        typeof reserve_bytes === "string" &&
        /^[1-9][0-9]{0,15}$/.test(limit_bytes) &&
        /^(0|[1-9][0-9]{0,15})$/.test(reserve_bytes),
      "rpc_memory_configuration",
    );
    this.limit = BigInt(limit_bytes);
    this.reserve = BigInt(reserve_bytes);
    this.buffers = new Map();
    this.used = 0n;
    this.peak = 0n;
    this.rejected = 0;
  }
  remaining() {
    return this.limit - this.used;
  }
  requireAllocation(size, free) {
    const withinBudget = size <= this.remaining() && this.buffers.size < 4096;
    const hasHeadroom =
      free === undefined ||
      (free >= this.reserve && size <= free - this.reserve);
    if (!withinBudget || !hasHeadroom) this.rejected++;
    requireValue(withinBudget, "rpc_buffer_budget");
    requireValue(hasHeadroom, "rpc_memory_headroom");
  }
  allocated(requested, response) {
    const pointer = response.readBigUInt64LE(),
      actual = response.readBigUInt64LE(8);
    if (pointer === 0n) {
      requireValue(actual === 0n, "rpc_allocation_response");
      return;
    }
    requireValue(
      !this.buffers.has(pointer) && actual >= requested,
      "rpc_allocation_response",
    );
    this.requireAllocation(actual);
    this.buffers.set(pointer, actual);
    this.used += actual;
    if (this.used > this.peak) this.peak = this.used;
  }
  requireBuffer(pointer) {
    requireValue(this.buffers.has(pointer), "rpc_buffer_unknown");
  }
  freed(pointer) {
    this.requireBuffer(pointer);
    this.used -= this.buffers.get(pointer);
    this.buffers.delete(pointer);
  }
  memory(free, total) {
    requireValue(free <= total, "rpc_memory_response");
    const visibleTotal = min(total, this.limit);
    const physicalFree = free > this.reserve ? free - this.reserve : 0n;
    return {
      free: min(physicalFree, this.remaining(), visibleTotal),
      total: visibleTotal,
    };
  }
  snapshot() {
    return {
      scope: "observed_rpc_buffers_only",
      limit_bytes: this.limit.toString(),
      reserve_bytes: this.reserve.toString(),
      allocated_bytes: this.used.toString(),
      peak_allocated_bytes: this.peak.toString(),
      live_buffers: this.buffers.size,
      rejected_allocations: this.rejected,
      os_memory_isolation: false,
    };
  }
}

export function isMemoryCommand(command) {
  return supported.has(command);
}

// Called within the guard's ordered stream lock. Injected memory queries and
// free barriers are consumed here and never mistaken for root-engine replies.
export async function observeMemoryCommand({
  command,
  bytes,
  header,
  input,
  output,
  worker,
  client,
  write,
  budget,
  freeBytes,
}) {
  requireValue(bytes === lengths.get(command), "rpc_memory_request");
  const request = await input.read(bytes);
  if ([0, 2, 11].includes(command))
    requireValue(request.readUInt32LE() === 0, "rpc_device");
  const response = async (expected) => {
    const size = await output.read(8);
    requireValue(
      size.readBigUInt64LE() === BigInt(expected),
      "rpc_memory_response",
    );
    return { size, body: await output.read(expected) };
  };
  const memoryBarrier = async () => {
    const query = Buffer.alloc(13);
    query[0] = 11;
    query.writeBigUInt64LE(4n, 1);
    await write(worker, query);
    const value = await response(16);
    const free = value.body.readBigUInt64LE(),
      total = value.body.readBigUInt64LE(8);
    requireValue(free <= total, "rpc_memory_response");
    return conservativeFree(free);
  };
  const conservativeFree = async (reported) => {
    if (!freeBytes) return reported;
    const physical = await freeBytes();
    requireValue(
      typeof physical === "bigint" && physical >= 0n,
      "rpc_physical_memory_unavailable",
    );
    return min(reported, physical);
  };
  let requested;
  let freeBefore;
  if (command === 0) {
    requested = request.readBigUInt64LE(4);
    budget.requireAllocation(requested);
    freeBefore = await memoryBarrier();
    budget.requireAllocation(requested, freeBefore);
  }
  if (command === 4) budget.requireBuffer(request.readBigUInt64LE());
  await write(worker, header);
  await write(worker, request);
  if (command === 4) {
    await memoryBarrier(); // The free was processed before crediting its budget.
    budget.freed(request.readBigUInt64LE());
    return;
  }
  const value = await response(command === 15 ? 4 : command === 2 ? 8 : 16);
  if (command === 0) {
    budget.requireAllocation(value.body.readBigUInt64LE(8), freeBefore);
    budget.allocated(requested, value.body);
  }
  if (command === 2)
    value.body.writeBigUInt64LE(
      min(value.body.readBigUInt64LE(), budget.remaining()),
    );
  if (command === 11) {
    requireValue(
      value.body.readBigUInt64LE() <= value.body.readBigUInt64LE(8),
      "rpc_memory_response",
    );
    const visible = budget.memory(
      await conservativeFree(value.body.readBigUInt64LE()),
      value.body.readBigUInt64LE(8),
    );
    value.body.writeBigUInt64LE(visible.free);
    value.body.writeBigUInt64LE(visible.total, 8);
  }
  if (command === 15)
    requireValue(value.body.readUInt32LE() === 1, "rpc_device_count");
  await write(client, value.size);
  await write(client, value.body);
}
