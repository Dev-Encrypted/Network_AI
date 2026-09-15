// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateDeviceRecipe } from "../../scripts/device-route-profile.mjs";
async function recipe() {
  const text = await readFile(
    new URL("../../examples/device-route.windows.json", import.meta.url),
    "utf8",
  );
  return JSON.parse(
    text
      .replaceAll(
        "REPLACE_WITH_EXISTING_CPU_DOMAIN_UUID",
        "11111111-2222-4333-8444-555555555555",
      )
      .replaceAll(
        "REPLACE_WITH_EXISTING_GPU_DOMAIN_UUID",
        "22222222-3333-4444-8555-666666666666",
      )
      .replaceAll(
        "REPLACE_WITH_PHYSICAL_GPU_UUID_FROM_DEVICES_COMMAND",
        "GPU-11111111-2222-3333-4444-555555555555",
      )
      .replace(/REPLACE_WITH_VERIFIED_[A-Z]+_BINARY_SHA256/g, "a".repeat(64)),
  );
}
test("the mixed recipe binds published placement while keeping payment shares independent", async () => {
  const value = await recipe();
  const parsed = validateDeviceRecipe(value);
  assert.deepEqual(
    parsed.stages.map((s) => s.tensor_weight),
    [1, 9],
  );
  assert.deepEqual(
    parsed.stages.map((s) => s.share_bps),
    [4500, 4500],
  );
  for (const mutate of [
    (r) => {
      r.stages[0].tensor_weight = 2;
    },
    (r) => {
      r.stages[1].device.buffer_budget_mib -= 256;
    },
    (r) => {
      r.model.execution_profile.context_tokens = 4096;
    },
    (r) => {
      r.stages[0].ports.http = r.root_http_port;
    },
    (r) => {
      r.stages[1].ports.rpc_udp_root = r.stages[0].ports.rpc_udp_root;
    },
    (r) => {
      r.stages[1].ports.root_rpc += 1;
    },
    (r) => {
      r.stages[1].resource_domain_id = r.stages[0].resource_domain_id;
    },
    (r) => {
      r.stages[0].share_bps = 3000;
    },
    (r) => {
      r.stages[0].engine.id = "llama-b10964-win-x64-cpu";
    },
  ]) {
    const changed = structuredClone(value);
    mutate(changed);
    assert.throws(() => validateDeviceRecipe(changed));
  }
});
