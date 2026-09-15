// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { verify } from "node:crypto";
import { z } from "zod";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const payload = z
  .object({
    network: z.literal("network-ai-private-lab"),
    aud: z.literal("network-ai-rpc-stage-readiness"),
    version: z.literal(1),
    stage_node_id: z.uuid(),
    stage_epoch: integer.positive(),
    route_id: z.uuid(),
    route_sha256: digest,
    manifest_sha256: digest,
    root_node_id: z.uuid(),
    root_epoch: integer.positive(),
    root_boot_id: z.uuid(),
    root_seen_ms: integer,
    issued_ms: integer,
    expires_ms: integer,
    rpc_generation: z.uuid(),
    request_nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();
function need(value) {
  if (!value)
    throw Object.assign(
      new Error("Invalid or expired private readiness declaration"),
      { code: "readiness_rejected" },
    );
}
export function verifyReadiness(
  token,
  { authority, binding, epoch, generation, nonce, nowMs = Date.now() },
) {
  need(typeof token === "string" && token.length <= 3072);
  const parts = token.split(".");
  need(
    parts.length === 3 &&
      parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p)) &&
      parts[2].length === 86,
  );
  need(
    verify(
      null,
      Buffer.from(`${parts[0]}.${parts[1]}`),
      authority,
      Buffer.from(parts[2], "base64url"),
    ),
  );
  const header = z
    .object({
      alg: z.literal("EdDSA"),
      typ: z.literal("NAI-READY"),
      v: z.literal(1),
    })
    .strict()
    .parse(JSON.parse(Buffer.from(parts[0], "base64url")));
  need(header.v === 1);
  const value = payload.parse(JSON.parse(Buffer.from(parts[1], "base64url")));
  need(
    value.stage_node_id === binding.stage_node_id &&
      value.stage_epoch === epoch &&
      value.route_id === binding.route_id &&
      value.route_sha256 === binding.route_sha256 &&
      value.manifest_sha256 === binding.manifest_sha256 &&
      value.rpc_generation === generation &&
      value.request_nonce === nonce &&
      value.root_seen_ms <= value.issued_ms &&
      value.issued_ms <= nowMs + 250 &&
      value.issued_ms >= nowMs - 4000 &&
      value.expires_ms > nowMs &&
      value.expires_ms > value.issued_ms &&
      value.expires_ms <= value.issued_ms + 4000 &&
      value.expires_ms <= value.root_seen_ms + 6000,
  );
  return value;
}
