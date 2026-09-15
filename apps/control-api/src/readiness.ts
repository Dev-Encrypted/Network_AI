// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// A short-lived declaration from the private coordinator, never an execution capability.
import { sign } from "node:crypto";
import { z } from "zod";
import { sha256, uuid } from "@network-ai/contracts";
import { Database } from "./db.js";
import type { Config } from "./config.js";
import { need } from "./errors.js";

export class Readiness {
  constructor(
    readonly db: Database,
    readonly config: Config,
  ) {}

  async stage(id: string, body: unknown) {
    uuid.parse(id);
    const data = z
      .object({
        epoch: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
        route_id: uuid,
        route_sha256: sha256,
        manifest_sha256: sha256,
        rpc_generation: uuid,
        request_nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
      })
      .strict()
      .parse(body);
    // Other stages need not already be READY: that would make initialization circular.
    // All membership/consent/account/model checks still apply to the complete route.
    const row = (
      await this.db.pool.query(
        `SELECT r.id,r.state,r.route_sha256,r.manifest_sha256,
      n.id AS root_node_id,n.epoch AS root_epoch,n.boot_id AS root_boot_id,
      floor(extract(epoch FROM clock_timestamp())*1000)::bigint::text AS now_ms,
      floor(extract(epoch FROM n.last_seen)*1000)::bigint::text AS root_seen_ms,
      p.epoch AS stage_epoch,p.desired_state AS stage_desired,
      (r.state='LOCAL_PREVIEW' AND m.state='LOCAL_PREVIEW' AND m.manifest_sha256=r.manifest_sha256
        AND n.node_kind='ROUTE_ROOT' AND n.public_key IS NOT NULL AND n.boot_id IS NOT NULL
        AND n.state='READY' AND n.desired_state='READY' AND n.epoch>0
        AND n.loaded_backend_models ? (m.manifest->>'backend_model')
        AND NOT EXISTS(SELECT 1 FROM route_members rm JOIN nodes part ON part.id=rm.node_id
          JOIN users u ON u.id=rm.provider_id
          LEFT JOIN route_acceptances a ON a.route_id=rm.route_id AND a.provider_id=rm.provider_id
          WHERE rm.route_id=r.id AND (a.provider_id IS NULL OR a.withdrawn_at IS NOT NULL
            OR a.route_sha256<>r.route_sha256 OR u.disabled OR part.owner_id<>rm.provider_id
            OR part.resource_domain_id<>rm.resource_domain_id OR part.model_id<>r.model_id
            OR part.desired_state<>'READY'))) AS eligible
      FROM execution_routes r JOIN nodes n ON n.id=r.root_node_id JOIN models m ON m.id=r.model_id
      JOIN route_members sm ON sm.route_id=r.id AND sm.node_id=$1 AND sm.role='STAGE'
      JOIN nodes p ON p.id=sm.node_id AND p.node_kind='RPC_STAGE'
      WHERE r.id=$2`,
        [id, data.route_id],
      )
    ).rows[0];
    need(
      row &&
        row.route_sha256 === data.route_sha256 &&
        row.manifest_sha256 === data.manifest_sha256,
      403,
      "stage_readiness_scope",
      "A declaração não pertence à rota e ao modelo deste nó.",
    );
    need(
      Number(row.stage_epoch) === data.epoch && row.stage_desired !== "REVOKED",
      409,
      "epoch_fenced",
      "A época do nó mudou.",
    );
    const now = Number(row.now_ms),
      seen = Number(row.root_seen_ms);
    // Two-second heartbeats need room for scheduling jitter across both links.
    const expires = Math.min(now + 4000, seen + 6000);
    if (
      !row.eligible ||
      !Number.isSafeInteger(seen) ||
      seen > now ||
      expires <= now + 250
    )
      return { ready: false, lease: null };
    const payload = {
      network: "network-ai-private-lab",
      aud: "network-ai-rpc-stage-readiness",
      version: 1,
      stage_node_id: id,
      stage_epoch: data.epoch,
      route_id: row.id,
      route_sha256: row.route_sha256,
      manifest_sha256: row.manifest_sha256,
      root_node_id: row.root_node_id,
      root_epoch: Number(row.root_epoch),
      root_boot_id: row.root_boot_id,
      root_seen_ms: seen,
      issued_ms: now,
      expires_ms: expires,
      rpc_generation: data.rpc_generation,
      request_nonce: data.request_nonce,
    };
    const header = Buffer.from(
      JSON.stringify({ alg: "EdDSA", typ: "NAI-READY", v: 1 }),
    ).toString("base64url");
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url"),
      message = `${header}.${encoded}`;
    const lease = `${message}.${sign(null, Buffer.from(message), this.config.capability_private_key_pem).toString("base64url")}`;
    return { ready: true, lease };
  }
}
