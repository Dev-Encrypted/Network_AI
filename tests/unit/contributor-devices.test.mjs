// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseNvidiaInventory,
  prepareDevice,
  validateDeviceBinding,
} from "../../packages/contributor/src/devices.mjs";
import { clusterOptions } from "../../scripts/cluster-options.mjs";
const uuid = "GPU-11111111-2222-3333-4444-555555555555";
const cuda = {
  mode: "private_contributor_device",
  engine: { id: "llama-b10964-win-x64-cuda12" },
  device: { kind: "CUDA", uuid, buffer_budget_mib: 3072, reserve_mib: 1024 },
};

test("GPU inventory rejects unavailable memory and duplicate physical identifiers", () => {
  const row = `${uuid}, NVIDIA fixture, 24564, 5470`;
  const [gpu] = parseNvidiaInventory(row + "\r\n");
  assert.equal(gpu.uuid, uuid);
  assert.equal(gpu.memory_free_mib, 5470);
  for (const text of [
    row + "\n" + row,
    row.replace("5470", "N/A"),
    row.replace("5470", "30000"),
    row.replace(uuid, "0"),
    "x".repeat(65537),
  ])
    assert.throws(() => parseNvidiaInventory(text));
});
test("device profiles reject legacy CUDA fallback and an engine from another backend", async () => {
  assert.throws(
    () => validateDeviceBinding({ ...cuda, mode: "private_contributor_cpu" }),
    { code: "worker_legacy_device" },
  );
  assert.throws(() => validateDeviceBinding({ ...cuda, device: undefined }), {
    code: "worker_device_required",
  });
  assert.throws(
    () =>
      validateDeviceBinding({
        ...cuda,
        engine: { id: "llama-b10964-win-x64-cpu" },
      }),
    { code: "worker_engine_device_mismatch" },
  );
  assert.equal(
    await prepareDevice({
      mode: "private_contributor_cpu",
      engine: { id: "llama-b10964-win-x64-cpu" },
    }),
    null,
  );
});
test("CUDA placement uses UUID across inventory reordering and refreshes physical headroom", async () => {
  let free = 5470;
  const probes = {
    cuda: async () =>
      parseNvidiaInventory(
        `GPU-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee, Other device, 24564, 24000\n${uuid}, Selected device, 24564, ${free}`,
      ),
  };
  const ready = await prepareDevice(cuda, probes);
  assert.equal(ready.engineDevice, "CUDA0");
  assert.deepEqual(ready.environment, { CUDA_VISIBLE_DEVICES: uuid });
  assert.equal(ready.snapshot().name, "Selected device");
  assert.equal(ready.memoryBudget.limit_bytes, "3221225472");
  free = 1200; // After startup, don't subtract owned allocations twice.
  assert.equal(await ready.freeBytes(), 1200n * 1048576n);
  assert.equal(ready.snapshot().memory_free_mib, 1200);
  await assert.rejects(prepareDevice(cuda, probes), {
    code: "worker_device_headroom",
  });
  const inspected = await prepareDevice(cuda, probes, {
    requireHeadroom: false,
  });
  assert.equal(inspected.snapshot().memory_free_mib, 1200);
  assert.equal(inspected.memoryBudget.limit_bytes, "3221225472");
  await assert.rejects(prepareDevice(cuda, { cuda: async () => [] }), {
    code: "worker_gpu_not_found",
  });
});
test("CPU contribution checks system RAM and reserves memory before starting", async () => {
  const profile = {
    ...cuda,
    engine: { id: "llama-b10964-win-x64-cpu" },
    device: { kind: "CPU", buffer_budget_mib: 4096, reserve_mib: 1024 },
  };
  const cpu = async () => ({
    name: "System RAM",
    memory_total_mib: 8192,
    memory_free_mib: 5120,
    source: "fixture",
  });
  const ready = await prepareDevice(profile, { cpu });
  assert.equal(ready.engineDevice, "CPU");
  assert.deepEqual(ready.environment, {});
  await assert.rejects(
    prepareDevice(
      { ...profile, device: { ...profile.device, reserve_mib: 1025 } },
      { cpu },
    ),
    { code: "worker_device_headroom" },
  );
});
test("unequal cluster placement validates each worker and keeps context and port bounds", () => {
  const config = clusterOptions({
    workers: "3",
    "worker-supervision": "external",
    "rpc-forward-port": "43844",
    "tensor-split": "1,3,6",
    context: "4096",
    batch: "64",
  });
  assert.deepEqual(config.split, [1, 3, 6]);
  assert.deepEqual(config.forwardPorts, [43844, 43845, 43846]);
  assert.equal(config.context, 4096);
  assert.deepEqual(clusterOptions({}).split, [1, 1]);
  for (const input of [
    { "tensor-split": "0,1" },
    { "tensor-split": "1" },
    { "tensor-split": "1,NaN" },
    { workers: "16" },
    { context: "511" },
    { context: "1e4" },
    { "rpc-port": "65535" },
    { "rpc-forward-port": "43821" },
    { port: "43821" },
    { workers: "0", "tensor-split": "1" },
    { "worker-supervision": "external" },
  ])
    assert.throws(() => clusterOptions(input));
});
