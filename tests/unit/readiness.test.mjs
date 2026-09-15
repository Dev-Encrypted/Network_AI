// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  generateKeyPairSync,
  sign,
  randomUUID,
  randomBytes,
} from "node:crypto";
import { verifyReadiness } from "../../packages/contributor/src/readiness.mjs";

const keys = generateKeyPairSync("ed25519");
const binding = {
  stage_node_id: randomUUID(),
  route_id: randomUUID(),
  route_sha256: "a".repeat(64),
  manifest_sha256: "b".repeat(64),
};
const value = {
  network: "network-ai-private-lab",
  aud: "network-ai-rpc-stage-readiness",
  version: 1,
  ...binding,
  stage_epoch: 7,
  root_node_id: randomUUID(),
  root_epoch: 3,
  root_boot_id: randomUUID(),
  root_seen_ms: 10000,
  issued_ms: 11000,
  expires_ms: 14000,
  rpc_generation: randomUUID(),
  request_nonce: randomBytes(32).toString("base64url"),
};
const options = {
  authority: keys.publicKey,
  binding,
  epoch: 7,
  generation: value.rpc_generation,
  nonce: value.request_nonce,
  nowMs: 11001,
};
function token(
  payload = value,
  header = { alg: "EdDSA", typ: "NAI-READY", v: 1 },
  key = keys.privateKey,
) {
  const message = [header, payload]
    .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
    .join(".");
  return `${message}.${sign(null, Buffer.from(message), key).toString("base64url")}`;
}
test("readiness is signed, bounded by the root observation, and never an execution token", () => {
  assert.deepEqual(verifyReadiness(token(), options), value);
  for (const candidate of [
    token(value, { alg: "EdDSA", typ: "NAI-CAP", v: 1 }),
    token({ ...value, scope: "stage_execute" }),
    token(value, undefined, generateKeyPairSync("ed25519").privateKey),
    token().replace(/.$/, "!"),
    "x".repeat(4000),
  ])
    assert.throws(() => verifyReadiness(candidate, options));
});
test("readiness cannot cross stage, epoch, route, model, request, or RPC generation", () => {
  const fields = {
    stage_node_id: randomUUID(),
    stage_epoch: 8,
    route_id: randomUUID(),
    route_sha256: "c".repeat(64),
    manifest_sha256: "d".repeat(64),
    rpc_generation: randomUUID(),
    request_nonce: randomBytes(32).toString("base64url"),
  };
  for (const [field, changed] of Object.entries(fields))
    assert.throws(
      () => verifyReadiness(token({ ...value, [field]: changed }), options),
      field,
    );
});
test("stale, expired, future, and extended declarations fail closed", () => {
  for (const changed of [
    { expires_ms: 11001 },
    { issued_ms: 12000 },
    { issued_ms: 6000 },
    { expires_ms: 16000 },
    { root_seen_ms: 12000 },
    { root_seen_ms: 5000 },
    { root_epoch: 0 },
    { root_boot_id: "invalid" },
  ])
    assert.throws(() =>
      verifyReadiness(token({ ...value, ...changed }), options),
    );
  assert.throws(() => verifyReadiness(token(), { ...options, nowMs: 14000 }));
});
