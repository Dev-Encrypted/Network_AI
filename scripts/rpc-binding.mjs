// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
const fields = ["stage_node_id", "route_id", "route_sha256", "manifest_sha256"];
export function validateRpcBinding(value) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  assert.deepEqual(
    Object.keys(value).sort(),
    [...fields].sort(),
    "RPC binding fields must be explicit",
  );
  for (const key of fields.slice(0, 2))
    assert.match(
      value[key],
      /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,
      "Use a canonical node and route UUID",
    );
  for (const key of fields.slice(2))
    assert.match(
      value[key],
      /^[a-f0-9]{64}$/,
      "Use the exact route and model manifest hashes",
    );
  return value;
}
export function matchesRpcBinding(binding, capability) {
  return (
    capability.node_id === binding.stage_node_id &&
    capability.route_id === binding.route_id &&
    capability.route_sha256 === binding.route_sha256 &&
    capability.manifest_sha256 === binding.manifest_sha256
  );
}
