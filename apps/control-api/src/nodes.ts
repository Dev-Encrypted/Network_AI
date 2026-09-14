// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import {
  heartbeatSchema,
  registerNodeSchema,
  uuid,
} from "@network-ai/contracts";
import { Database } from "./db.js";
import { need } from "./errors.js";
import { hash, verifyNodeSignature } from "./security.js";

export class Nodes {
  constructor(readonly db: Database) {}
  async signed(req: FastifyRequest & { rawBody?: Buffer }, id: string) {
    uuid.parse(id);
    const timestamp = z.coerce
      .number()
      .int()
      .parse(req.headers["x-node-timestamp"]);
    const nonce = z
      .string()
      .regex(/^[A-Za-z0-9_-]{20,100}$/)
      .parse(req.headers["x-node-nonce"]);
    const signature = z
      .string()
      .regex(/^[A-Za-z0-9_-]{86}$/)
      .parse(req.headers["x-node-signature"]);
    need(
      Math.abs(Date.now() / 1000 - timestamp) <= 30,
      401,
      "signature_expired",
      "Assinatura fora da janela de validade.",
    );
    const row = (
      await this.db.pool.query(
        "SELECT * FROM nodes WHERE id=$1 AND desired_state<>'REVOKED'",
        [id],
      )
    ).rows[0];
    const message = `network-ai/node/v1\n${req.method}\n${req.url}\n${timestamp}\n${nonce}\n${hash(req.rawBody ?? Buffer.alloc(0))}`;
    need(
      row?.public_key &&
        verifyNodeSignature(row.public_key, message, signature),
      401,
      "node_signature",
      "Assinatura do nó inválida.",
    );
    const insert = await this.db.pool.query(
      "INSERT INTO node_nonces(node_id,nonce) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING nonce",
      [id, nonce],
    );
    need(
      insert.rowCount,
      409,
      "nonce_replayed",
      "Esta mensagem já foi processada.",
    );
    return row;
  }
  async register(body: unknown) {
    const data = registerNodeSchema.parse(body);
    need(
      Math.abs(Date.now() / 1000 - data.timestamp) <= 30,
      401,
      "signature_expired",
      "Assinatura expirada.",
    );
    const message = `network-ai/register/v1\n${hash(data.invite)}\n${data.nonce}\n${data.public_key}\n${data.boot_id}\n${data.timestamp}`;
    need(
      verifyNodeSignature(data.public_key, message, data.signature),
      401,
      "node_signature",
      "Assinatura inválida.",
    );
    return this.db.transaction(async (tx) => {
      const invite = (
        await tx.query(
          "SELECT * FROM node_invites WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE",
          [hash(data.invite)],
        )
      ).rows[0];
      need(invite, 401, "invite_invalid", "Convite inválido ou já utilizado.");
      const node = (
        await tx.query(
          `UPDATE nodes SET public_key=$2,boot_id=$3,epoch=epoch+1,state='VALIDATING',last_seen=now()
        WHERE id=$1 AND public_key IS NULL AND desired_state<>'REVOKED' RETURNING id,epoch`,
          [invite.node_id, data.public_key, data.boot_id],
        )
      ).rows[0];
      need(node, 409, "node_registered", "Nó indisponível para registro.");
      await tx.query(
        "UPDATE node_invites SET consumed_at=now() WHERE token_hash=$1",
        [hash(data.invite)],
      );
      return { ...node, epoch: Number(node.epoch) };
    });
  }
  async resume(id: string, body: unknown) {
    const data = z.object({ boot_id: uuid }).strict().parse(body);
    const row = (
      await this.db.pool.query(
        `UPDATE nodes SET epoch=CASE WHEN boot_id=$2 THEN epoch ELSE epoch+1 END,
      boot_id=$2,state='VALIDATING',last_seen=now() WHERE id=$1 AND desired_state<>'REVOKED' RETURNING id,epoch`,
        [id, data.boot_id],
      )
    ).rows[0];
    need(row, 401, "node_revoked", "Nó revogado.");
    return { ...row, epoch: Number(row.epoch) };
  }
  async heartbeat(id: string, body: unknown) {
    const data = heartbeatSchema.parse(body);
    const row = (
      await this.db.pool.query(
        `UPDATE nodes n SET last_seen=now(),inventory=$4,loaded_backend_models=$5,
      state=CASE WHEN desired_state='PAUSED' THEN 'PAUSED' WHEN $6='READY' AND $5::jsonb ? (SELECT manifest->>'backend_model' FROM models WHERE id=n.model_id) THEN 'READY'
        WHEN $6='READY' THEN 'VALIDATING' ELSE $6 END
      WHERE id=$1 AND epoch=$2 AND boot_id=$3 AND desired_state<>'REVOKED' RETURNING id,desired_state,state,epoch`,
        [
          id,
          data.epoch,
          data.boot_id,
          data.inventory,
          JSON.stringify(data.loaded_backend_models),
          data.state,
        ],
      )
    ).rows[0];
    need(row, 409, "epoch_fenced", "Época ou identidade do nó inválida.");
    const cancelled = await this.db.pool.query(
      `SELECT s.id FROM sessions s WHERE s.id=ANY($2::uuid[])
        AND (s.node_id=$1 OR EXISTS(SELECT 1 FROM session_participants p WHERE p.session_id=s.id AND p.node_id=$1))
        AND s.state IN ('CANCELLING','COMPLETED','FAILED','CANCELLED','INTERRUPTED')`,
      [id, data.running_sessions],
    );
    return {
      ...row,
      epoch: Number(row.epoch),
      cancel_sessions: cancelled.rows.map((item) => item.id),
    };
  }
}
