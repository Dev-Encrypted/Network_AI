// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { execFile } from "node:child_process";
import { freemem, totalmem } from "node:os";
import { win32 } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

const exec = promisify(execFile);
const mib = 1048576n;
const bounds = {
  buffer_budget_mib: z.number().int().min(256).max(1048576),
  reserve_mib: z.number().int().min(256).max(1048576),
};
export const deviceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("CPU"), ...bounds }).strict(),
  z
    .object({
      kind: z.literal("CUDA"),
      uuid: z
        .string()
        .regex(/^GPU-[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$/),
      ...bounds,
    })
    .strict(),
]);
function requireValue(value, code) {
  if (!value) throw Object.assign(new Error(code), { code });
}
export function validateDeviceBinding(c) {
  if (c.mode === "private_contributor_cpu") {
    requireValue(
      !c.device && c.engine.id === "llama-b10964-win-x64-cpu",
      "worker_legacy_device",
    );
  } else {
    requireValue(c.device, "worker_device_required");
    requireValue(
      c.engine.id ===
        (c.device.kind === "CUDA"
          ? "llama-b10964-win-x64-cuda12"
          : "llama-b10964-win-x64-cpu"),
      "worker_engine_device_mismatch",
    );
  }
}

// Driver observations are independent of ggml's CUDA process memory view. On
// Windows WDDM that view may overstate the memory available beside other apps.
export function parseNvidiaInventory(text) {
  requireValue(
    typeof text === "string" && text.length <= 65536,
    "worker_gpu_inventory",
  );
  const rows = text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const fields = line.split(",").map((part) => part.trim());
      requireValue(fields.length >= 4, "worker_gpu_inventory");
      const uuid = fields[0],
        name = fields.slice(1, -2).join(", ");
      const [total, free] = fields.slice(-2);
      requireValue(
        /^GPU-[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$/.test(
          uuid,
        ) &&
          name.length > 0 &&
          name.length <= 200,
        "worker_gpu_inventory",
      );
      requireValue(
        [total, free].every((n) => /^[0-9]{1,7}$/.test(n)) &&
          Number(total) > 0 &&
          Number(free) <= Number(total),
        "worker_gpu_memory_unavailable",
      );
      return {
        kind: "CUDA",
        uuid,
        name,
        memory_total_mib: Number(total),
        memory_free_mib: Number(free),
        source: "nvidia-smi",
      };
    });
  requireValue(
    rows.length <= 64 &&
      new Set(rows.map((row) => row.uuid.toLowerCase())).size === rows.length,
    "worker_gpu_inventory",
  );
  return rows;
}
export async function nvidiaInventory() {
  requireValue(
    process.platform === "win32",
    "worker_gpu_platform_not_qualified",
  );
  const system =
    process.env.SystemRoot ?? process.env.SYSTEMROOT ?? "C:\\Windows";
  requireValue(win32.isAbsolute(system), "worker_gpu_inventory_tool");
  try {
    const { stdout } = await exec(
      win32.join(system, "System32", "nvidia-smi.exe"),
      [
        "--query-gpu=uuid,name,memory.total,memory.free",
        "--format=csv,noheader,nounits",
      ],
      { windowsHide: true, timeout: 3000, maxBuffer: 65536, encoding: "utf8" },
    );
    return parseNvidiaInventory(stdout);
  } catch (e) {
    if (e.code?.startsWith?.("worker_")) throw e;
    throw Object.assign(new Error("worker_gpu_inventory_unavailable"), {
      code: "worker_gpu_inventory_unavailable",
    });
  }
}
export function cpuInventory() {
  return {
    kind: "CPU",
    name: "System RAM",
    memory_total_mib: Math.floor(totalmem() / Number(mib)),
    memory_free_mib: Math.floor(freemem() / Number(mib)),
    source: "node:os",
  };
}
export async function availableDevices() {
  const cpu = cpuInventory();
  try {
    return {
      observed_at_unix_ms: Date.now(),
      devices: [cpu, ...(await nvidiaInventory())],
      gpu_inventory_error: null,
      qualification: "inventory_only",
    };
  } catch (e) {
    return {
      observed_at_unix_ms: Date.now(),
      devices: [cpu],
      gpu_inventory_error: e.code,
      qualification: "inventory_only",
    };
  }
}
export async function prepareDevice(
  c,
  probes = { cpu: cpuInventory, cuda: nvidiaInventory },
  { requireHeadroom = true } = {},
) {
  validateDeviceBinding(c);
  if (!c.device) return null;
  const device = deviceSchema.parse(c.device);
  const inspect = async () => {
    const observed =
      device.kind === "CPU"
        ? await probes.cpu()
        : (await probes.cuda()).find(
            (gpu) => gpu.uuid.toLowerCase() === device.uuid.toLowerCase(),
          );
    requireValue(observed, "worker_gpu_not_found");
    requireValue(
      Number.isSafeInteger(observed.memory_free_mib) &&
        Number.isSafeInteger(observed.memory_total_mib) &&
        observed.memory_free_mib >= 0 &&
        observed.memory_free_mib <= observed.memory_total_mib,
      "worker_device_memory_unavailable",
    );
    return observed;
  };
  const first = await inspect();
  if (requireHeadroom)
    requireValue(
      first.memory_free_mib >= device.buffer_budget_mib + device.reserve_mib,
      "worker_device_headroom",
    );
  let latest = { ...first, observed_at_unix_ms: Date.now() };
  return {
    engineDevice: device.kind === "CPU" ? "CPU" : "CUDA0",
    environment:
      device.kind === "CUDA" ? { CUDA_VISIBLE_DEVICES: device.uuid } : {},
    memoryBudget: {
      limit_bytes: (BigInt(device.buffer_budget_mib) * mib).toString(),
      reserve_bytes: (BigInt(device.reserve_mib) * mib).toString(),
    },
    freeBytes: async () => {
      latest = { ...(await inspect()), observed_at_unix_ms: Date.now() };
      return BigInt(latest.memory_free_mib) * mib;
    },
    snapshot: () => ({
      kind: device.kind,
      name: latest.name,
      buffer_budget_mib: device.buffer_budget_mib,
      reserve_mib: device.reserve_mib,
      memory_total_mib: latest.memory_total_mib,
      memory_free_mib: latest.memory_free_mib,
      observation_source: latest.source,
      observed_at_unix_ms: latest.observed_at_unix_ms,
      os_memory_isolation: false,
    }),
  };
}
