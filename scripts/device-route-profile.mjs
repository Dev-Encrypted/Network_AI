// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import {
  deviceSchema,
  validateDeviceBinding,
} from "../packages/contributor/src/devices.mjs";
import { modelManifestSchema } from "../packages/contracts/dist/index.js";
const { z } = createRequire(
  new URL("../packages/contributor/package.json", import.meta.url),
)("zod");
const port = z.number().int().min(1024).max(65535),
  httpPort = port.min(43103).max(43299);
const binary = z
  .object({
    path: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const deviceRouteRecipeSchema = z
  .object({
    schema_version: z.literal(1),
    id: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
    name: z.string().min(1).max(100),
    model: modelManifestSchema,
    artifact_manifest: z.string().min(1),
    model_directory: z.string().min(1),
    root_engine_directory: z.string().min(1),
    root_resource_domain_id: z.uuid(),
    root_share_bps: z.number().int().min(1).max(9999),
    root_http_port: httpPort,
    engine_port: httpPort,
    batch: z.number().int().min(1).max(2048),
    root_threads: z.number().int().min(1).max(32),
    binaries: z
      .object({ node: binary, http: binary, rpc: binary, guardian: binary })
      .strict(),
    stages: z
      .array(
        z
          .object({
            name: z.string().min(1).max(100),
            resource_domain_id: z.uuid(),
            share_bps: z.number().int().min(1).max(9999),
            tensor_weight: z.number().int().min(1).max(10000),
            engine: z
              .object({
                id: z.enum([
                  "llama-b10964-win-x64-cpu",
                  "llama-b10964-win-x64-cuda12",
                ]),
                directory: z.string().min(1),
              })
              .strict(),
            device: deviceSchema,
            threads: z.number().int().min(1).max(32),
            ports: z
              .object({
                http: httpPort,
                control_from_root: httpPort,
                control_to_coordinator: port,
                worker_rpc: port,
                guard_rpc: port,
                root_rpc: port,
                control_udp_root: port,
                control_udp_stage: port,
                rpc_udp_root: port,
                rpc_udp_stage: port,
              })
              .strict(),
          })
          .strict(),
      )
      .min(1)
      .max(15),
  })
  .strict();
export function validateDeviceRecipe(raw) {
  const recipe = deviceRouteRecipeSchema.parse(raw);
  const tcp = [recipe.root_http_port, recipe.engine_port],
    udp = [];
  const devices = new Map();
  for (const [index, stage] of recipe.stages.entries()) {
    validateDeviceBinding({ ...stage, mode: "private_contributor_device" });
    for (const [name, value] of Object.entries(stage.ports))
      (name.includes("udp") ? udp : tcp).push(value);
    assert.equal(
      stage.ports.root_rpc,
      recipe.stages[0].ports.root_rpc + index,
      "Root RPC ports must be contiguous in tensor-split order",
    );
    assert.equal(
      stage.ports.worker_rpc,
      recipe.stages[0].ports.worker_rpc + index,
      "Worker RPC ports must be contiguous in recipe order",
    );
    const physical =
      stage.device.kind === "CUDA" ? stage.device.uuid.toLowerCase() : "CPU";
    if (devices.has(physical))
      assert.equal(
        devices.get(physical),
        stage.resource_domain_id,
        "One physical device cannot create two admission domains",
      );
    else devices.set(physical, stage.resource_domain_id);
    if (stage.device.kind === "CPU")
      assert.equal(
        stage.resource_domain_id,
        recipe.root_resource_domain_id,
        "This one-host installer shares the root CPU domain",
      );
  }
  assert.equal(new Set(tcp).size, tcp.length, "Recipe TCP port collision");
  assert.equal(new Set(udp).size, udp.length, "Recipe UDP port collision");
  assert.equal(
    recipe.root_share_bps +
      recipe.stages.reduce((sum, stage) => sum + stage.share_bps, 0),
    10000,
    "Provider shares must total 10000 basis points",
  );
  const execution = {
    schema_version: 1,
    adapter: "llama-b10964-rpc",
    engine_commit: "b29c606e28a01b1bc8c1351026a0fa6e616bf6c4",
    transport: "iroh-direct-quic-guarded-rpc",
    split_mode: "layer",
    context_tokens: recipe.model.max_context_tokens,
    batch_tokens: recipe.batch,
    slots: 1,
    stages: recipe.stages.map((stage) => ({
      device: stage.device.kind,
      tensor_weight: stage.tensor_weight,
      buffer_budget_mib: stage.device.buffer_budget_mib,
      reserve_mib: stage.device.reserve_mib,
      threads: stage.threads,
    })),
  };
  assert.deepEqual(
    recipe.model.execution_profile,
    execution,
    "Published execution profile must match the installed placement and budgets",
  );
  assert.equal(
    recipe.model.backend_model,
    "network-ai-qualified-model",
    "Root adapter uses this exact backend alias",
  );
  return recipe;
}
export async function loadDeviceRecipe(file) {
  const path = resolve(file),
    directory = dirname(path);
  const recipe = validateDeviceRecipe(JSON.parse(await readFile(path, "utf8")));
  for (const key of [
    "artifact_manifest",
    "model_directory",
    "root_engine_directory",
  ])
    recipe[key] = resolve(directory, recipe[key]);
  for (const binary of Object.values(recipe.binaries))
    binary.path = resolve(directory, binary.path);
  for (const stage of recipe.stages)
    stage.engine.directory = resolve(directory, stage.engine.directory);
  return recipe;
}
