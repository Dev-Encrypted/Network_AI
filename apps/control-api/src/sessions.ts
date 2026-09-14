// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import {
  modelManifestSchema,
  chargeFor,
  receiptSchema,
  sha256,
  terminalStates,
  uuid,
} from "@network-ai/contracts";
import type { User } from "./auth.js";
import type { Config } from "./config.js";
import { Database } from "./db.js";
import { need } from "./errors.js";
import { availableAccount, heldAccount, post } from "./ledger.js";
import { canonical, capability, hash } from "./security.js";

type Row = Record<string, any>;
const terminal = (state: string): boolean =>
  (terminalStates as readonly string[]).includes(state);
export class Sessions {
  constructor(
    readonly db: Database,
    readonly config: Config,
  ) {}
  async list(user: User) {
    return (
      await this.db.pool.query(
        "SELECT * FROM sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
        [user.id],
      )
    ).rows;
  }
  async get(user: User, id: string) {
    uuid.parse(id);
    const row = (
      await this.db.pool.query(
        "SELECT * FROM sessions WHERE id=$1 AND user_id=$2",
        [id, user.id],
      )
    ).rows[0];
    need(row, 404, "session_missing", "Sessão não encontrada.");
    const events = await this.db.pool.query(
      "SELECT sequence,kind,metadata,created_at FROM events WHERE session_id=$1 ORDER BY sequence",
      [id],
    );
    return { ...row, events: events.rows };
  }
  async create(user: User, body: unknown) {
    const data = z
      .object({
        quote_id: uuid,
        idempotency_key: z.string().regex(/^[A-Za-z0-9_.:-]{8,100}$/),
        request_sha256: sha256,
        request_bytes: z.number().int().min(1).max(131072),
        model: z.string().max(80),
        max_tokens: z.number().int().positive(),
        content_bytes: z.number().int().min(0).max(65536),
        message_count: z.number().int().min(1).max(64),
      })
      .strict()
      .parse(body);
    return this.db.transaction(async (tx) => {
      await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user.id]);
      const existing = (
        await tx.query(
          "SELECT * FROM sessions WHERE user_id=$1 AND idempotency_key=$2",
          [user.id, data.idempotency_key],
        )
      ).rows[0];
      if (existing) {
        need(
          existing.request_sha256 === data.request_sha256,
          409,
          "idempotency_conflict",
          "Esta chave já foi usada com outra solicitação.",
        );
        return { ...existing, reused: true, result_retained: false };
      }
      const quote = (
        await tx.query(
          "SELECT q.* FROM quotes q JOIN models m ON m.id=q.model_id WHERE q.id=$1 AND q.user_id=$2 AND q.expires_at>now() AND m.state='LOCAL_PREVIEW' FOR UPDATE OF q",
          [data.quote_id, user.id],
        )
      ).rows[0];
      need(
        quote,
        409,
        "quote_expired",
        "A cotação expirou ou o modelo foi desabilitado.",
      );
      need(
        quote.model_id === data.model &&
          quote.max_output_tokens === data.max_tokens,
        409,
        "quote_mismatch",
        "A solicitação difere da cotação.",
      );
      const model = modelManifestSchema.parse(quote.manifest);
      need(
        data.content_bytes <= model.max_input_bytes,
        413,
        "input_limit",
        "A conversa excedeu o limite de entrada deste modelo.",
      );
      // Byte envelope is deliberately conservative; it is not tokenizer certification.
      need(
        data.content_bytes + data.message_count * 64 + data.max_tokens <=
          model.max_context_tokens,
        413,
        "context_limit",
        "Reduza a conversa ou o limite de saída.",
      );
      const active = await tx.query(
        `SELECT count(*)::int AS n FROM sessions WHERE user_id=$1 AND state NOT IN ('COMPLETED','FAILED','CANCELLED','INTERRUPTED')`,
        [user.id],
      );
      need(
        active.rows[0].n < 4,
        429,
        "session_limit",
        "Você já tem quatro sessões em andamento.",
      );
      const id = randomUUID();
      const hold = BigInt(quote.maximum_microtu);
      if (hold > 0n)
        await post(
          tx,
          `hold:${id}`,
          "RESERVE",
          [
            [availableAccount(user.id), -hold],
            [heldAccount(user.id), hold],
          ],
          { session_id: id },
        );
      const result = await tx.query(
        `INSERT INTO sessions(id,user_id,quote_id,model_id,manifest_sha256,idempotency_key,request_sha256,request_bytes,state,hold_microtu,queue_deadline)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'QUEUED',$9,now()+interval '120 seconds') RETURNING *`,
        [
          id,
          user.id,
          quote.id,
          data.model,
          quote.manifest_sha256,
          data.idempotency_key,
          data.request_sha256,
          data.request_bytes,
          hold.toString(),
        ],
      );
      await this.event(tx, id, "queued", { maximum_microtu: hold.toString() });
      return { ...result.rows[0], reused: false };
    });
  }
  async event(
    tx: PoolClient,
    id: string,
    kind: string,
    metadata: Record<string, unknown> = {},
  ) {
    await tx.query(
      "INSERT INTO events(session_id,kind,metadata) VALUES($1,$2,$3)",
      [id, kind, metadata],
    );
  }
  cap(session: Row, quote: Row, node: Row, scope: "prepare" | "execute") {
    const manifest = modelManifestSchema.parse(quote.manifest);
    return capability(this.config.capability_private_key_pem, {
      network: "network-ai-private-lab",
      aud: "network-ai-node",
      scope,
      session_id: session.id,
      attempt_id: session.attempt_id,
      node_id: node.id,
      epoch: Number(node.epoch),
      model: session.model_id,
      backend_model: manifest.backend_model,
      manifest_sha256: session.manifest_sha256,
      request_sha256: session.request_sha256,
      max_output_tokens: quote.max_output_tokens,
      max_context_tokens: manifest.max_context_tokens,
      max_input_bytes: manifest.max_input_bytes,
      prepare_id: scope === "execute" ? session.prepare_id : null,
      exp: Math.floor(new Date(session.execution_deadline).getTime() / 1000),
    });
  }
  async admit(id: string) {
    uuid.parse(id);
    return this.db.transaction(async (tx) => {
      // A single transaction lock serializes admission across all gateways in this private coordinator.
      await tx.query("SELECT pg_advisory_xact_lock(742019)");
      const s = (
        await tx.query("SELECT * FROM sessions WHERE id=$1 FOR UPDATE", [id])
      ).rows[0];
      need(s, 404, "session_missing", "Sessão não encontrada.");
      if (terminal(s.state))
        return { state: s.state, error_code: s.error_code };
      if (
        new Date(s.queue_deadline).getTime() < Date.now() &&
        s.state === "QUEUED"
      ) {
        await this.finalize(tx, s, "INTERRUPTED", 0n, "queue_timeout");
        return { state: "INTERRUPTED", error_code: "queue_timeout" };
      }
      need(
        s.state === "QUEUED",
        409,
        "admission_state",
        "Esta sessão já foi admitida.",
      );
      const next = (
        await tx.query(`SELECT s.id FROM sessions s JOIN users u ON u.id=s.user_id
        JOIN models m ON m.id=s.model_id AND m.state='LOCAL_PREVIEW'
        WHERE s.state='QUEUED' AND s.queue_deadline>now() AND EXISTS (
          SELECT 1 FROM nodes n JOIN resource_domains d ON d.id=n.resource_domain_id
          WHERE n.model_id=s.model_id AND n.state='READY' AND n.desired_state='READY' AND n.last_seen>now()-interval '15 seconds'
          AND n.loaded_backend_models ? (m.manifest->>'backend_model')
          AND (SELECT count(*) FROM sessions a WHERE a.resource_domain_id=d.id AND a.state IN ('PREPARING','AUTHORIZED','RUNNING','CANCELLING')) < d.slots)
        ORDER BY u.last_admitted_at,s.created_at,s.id LIMIT 1`)
      ).rows[0];
      if (!next || next.id !== id)
        return { state: "QUEUED", retry_after_ms: 300 };
      const node = (
        await tx.query(
          `SELECT n.* FROM nodes n JOIN models m ON m.id=n.model_id JOIN resource_domains d ON d.id=n.resource_domain_id
        WHERE n.model_id=$1 AND n.state='READY' AND n.desired_state='READY' AND n.last_seen>now()-interval '15 seconds'
        AND n.loaded_backend_models ? (m.manifest->>'backend_model')
        AND (SELECT count(*) FROM sessions a WHERE a.resource_domain_id=d.id AND a.state IN ('PREPARING','AUTHORIZED','RUNNING','CANCELLING'))<d.slots
        ORDER BY n.last_seen DESC,n.id LIMIT 1 FOR UPDATE OF d,n`,
          [s.model_id],
        )
      ).rows[0];
      if (!node) return { state: "QUEUED", retry_after_ms: 300 };
      const attempt = randomUUID();
      const updated = (
        await tx.query(
          `UPDATE sessions SET state='PREPARING',node_id=$2,resource_domain_id=$3,attempt_id=$4,node_epoch=$5,
        execution_deadline=now()+interval '180 seconds' WHERE id=$1 RETURNING *`,
          [id, node.id, node.resource_domain_id, attempt, node.epoch],
        )
      ).rows[0];
      await tx.query("UPDATE users SET last_admitted_at=now() WHERE id=$1", [
        s.user_id,
      ]);
      await this.event(tx, id, "admitted", {
        node_id: node.id,
        resource_domain_id: node.resource_domain_id,
        attempt_id: attempt,
      });
      const quote = (
        await tx.query("SELECT * FROM quotes WHERE id=$1", [s.quote_id])
      ).rows[0];
      return {
        state: "PREPARING",
        node_url: node.base_url,
        capability: this.cap(updated, quote, node, "prepare"),
        attempt_id: attempt,
      };
    });
  }
  async authorize(id: string, body: unknown) {
    uuid.parse(id);
    const data = z
      .object({ prepare_id: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/) })
      .strict()
      .parse(body);
    return this.db.transaction(async (tx) => {
      const s = (
        await tx.query("SELECT * FROM sessions WHERE id=$1 FOR UPDATE", [id])
      ).rows[0];
      need(
        s &&
          s.state === "PREPARING" &&
          new Date(s.execution_deadline).getTime() > Date.now(),
        409,
        "prepare_expired",
        "A preparação expirou ou foi cancelada.",
      );
      const node = (
        await tx.query("SELECT * FROM nodes WHERE id=$1", [s.node_id])
      ).rows[0];
      need(
        node &&
          node.epoch === s.node_epoch &&
          node.desired_state === "READY" &&
          node.last_seen > new Date(Date.now() - 15000),
        409,
        "node_changed",
        "O nó mudou durante a preparação.",
      );
      await tx.query(
        "UPDATE sessions SET state='AUTHORIZED',prepare_id=$2 WHERE id=$1",
        [id, data.prepare_id],
      );
      const quote = (
        await tx.query("SELECT * FROM quotes WHERE id=$1", [s.quote_id])
      ).rows[0];
      await this.event(tx, id, "authorized");
      return {
        state: "AUTHORIZED",
        capability: this.cap(
          { ...s, prepare_id: data.prepare_id },
          quote,
          node,
          "execute",
        ),
      };
    });
  }
  async claim(nodeId: string, body: unknown) {
    const data = z
      .object({
        session_id: uuid,
        attempt_id: uuid,
        epoch: z.number().int().positive(),
        prepare_id: z.string().max(100),
      })
      .strict()
      .parse(body);
    const result = await this.db.pool.query(
      `UPDATE sessions s SET state='RUNNING',started_at=now()
      WHERE s.id=$1 AND s.node_id=$2 AND s.attempt_id=$3 AND s.node_epoch=$4 AND s.prepare_id=$5 AND s.state='AUTHORIZED' AND s.execution_deadline>now()
      AND EXISTS(SELECT 1 FROM nodes n WHERE n.id=s.node_id AND n.epoch=s.node_epoch AND n.desired_state='READY') RETURNING s.id`,
      [data.session_id, nodeId, data.attempt_id, data.epoch, data.prepare_id],
    );
    need(
      result.rowCount,
      409,
      "claim_rejected",
      "Autorização expirada, consumida ou cancelada.",
    );
    return { accepted: true };
  }
  async finalize(
    tx: PoolClient,
    s: Row,
    state: string,
    charge: bigint,
    error: string | null,
    billing?: string,
  ) {
    if (terminal(s.state)) return;
    const hold = BigInt(s.hold_microtu);
    need(
      charge >= 0n && charge <= hold,
      500,
      "charge_limit",
      "Liquidação excedeu a reserva.",
    );
    const lines: Array<[string, bigint]> = [
      [heldAccount(s.user_id), -hold],
      [availableAccount(s.user_id), hold - charge],
    ];
    if (charge > 0n) {
      const node = (
        await tx.query("SELECT owner_id FROM nodes WHERE id=$1", [s.node_id])
      ).rows[0];
      const fee = (charge * 2000n) / 10000n;
      lines.push(
        [availableAccount(node.owner_id), charge - fee],
        ["lab:working", fee],
      );
    }
    if (hold > 0n)
      await post(
        tx,
        `settle:${s.id}`,
        charge > 0n ? "SETTLE" : "REFUND",
        lines,
        {
          session_id: s.id,
          state,
          charge_microtu: charge.toString(),
          fee_bps: 2000,
        },
      );
    await tx.query(
      "UPDATE sessions SET state=$2,billing_state=$3,charged_microtu=$4,error_code=$5,finished_at=now() WHERE id=$1",
      [
        s.id,
        state,
        billing ?? (charge > 0n ? "SETTLED" : "REFUNDED"),
        charge.toString(),
        error,
      ],
    );
    await this.event(tx, s.id, "terminal", {
      state,
      error_code: error,
      charged_microtu: charge.toString(),
    });
  }
  async receipt(nodeId: string, body: unknown) {
    const data = receiptSchema.parse(body);
    const digest = hash(canonical(data));
    return this.db.transaction(async (tx) => {
      const s = (
        await tx.query("SELECT * FROM sessions WHERE id=$1 FOR UPDATE", [
          data.session_id,
        ])
      ).rows[0];
      need(
        s &&
          s.node_id === nodeId &&
          s.attempt_id === data.attempt_id &&
          Number(s.node_epoch) === data.epoch,
        409,
        "receipt_identity",
        "Recibo não pertence a esta tentativa.",
      );
      const existing = (
        await tx.query("SELECT digest FROM receipts WHERE session_id=$1", [
          s.id,
        ])
      ).rows[0];
      if (existing) {
        need(
          existing.digest === digest,
          409,
          "receipt_conflict",
          "Recibo conflitante.",
        );
        return { accepted: true, duplicate: true };
      }
      if (terminal(s.state))
        return { accepted: false, terminal: true, state: s.state };
      need(
        ["RUNNING", "CANCELLING"].includes(s.state),
        409,
        "receipt_state",
        "A execução ainda não foi reivindicada.",
      );
      const node = (
        await tx.query("SELECT epoch,desired_state FROM nodes WHERE id=$1", [
          nodeId,
        ])
      ).rows[0];
      need(
        node &&
          Number(node.epoch) === data.epoch &&
          node.desired_state !== "REVOKED",
        409,
        "epoch_fenced",
        "A identidade desta execução foi invalidada.",
      );
      const quote = (
        await tx.query("SELECT * FROM quotes WHERE id=$1", [s.quote_id])
      ).rows[0];
      const model = modelManifestSchema.parse(quote.manifest);
      const valid =
        data.state === "COMPLETED" &&
        data.stream_done &&
        data.prompt_tokens > 0 &&
        data.completion_tokens > 0 &&
        data.finish_reason !== null &&
        data.prompt_tokens <=
          model.max_context_tokens - quote.max_output_tokens &&
        data.completion_tokens <= quote.max_output_tokens;
      const cancelled = s.state === "CANCELLING";
      const charge =
        valid && !cancelled
          ? chargeFor(model, data.prompt_tokens, data.completion_tokens)
          : 0n;
      const state = cancelled
        ? "CANCELLED"
        : data.state === "COMPLETED" && !valid
          ? "FAILED"
          : data.state;
      const error = cancelled
        ? "cancelled"
        : data.state === "COMPLETED" && !valid
          ? "invalid_usage"
          : data.error_code;
      await tx.query(
        "INSERT INTO receipts(session_id,attempt_id,node_id,digest,payload) VALUES($1,$2,$3,$4,$5)",
        [s.id, data.attempt_id, nodeId, digest, data],
      );
      await tx.query(
        "UPDATE sessions SET prompt_tokens=$2,completion_tokens=$3,elapsed_ms=$4 WHERE id=$1",
        [s.id, data.prompt_tokens, data.completion_tokens, data.elapsed_ms],
      );
      await this.finalize(
        tx,
        s,
        state,
        charge,
        error,
        !valid && data.state === "COMPLETED" ? "DISPUTED" : undefined,
      );
      return { accepted: true, state, charged_microtu: charge.toString() };
    });
  }
  async cancel(user: User, id: string) {
    uuid.parse(id);
    return this.db.transaction(async (tx) => {
      const s = (
        await tx.query(
          "SELECT * FROM sessions WHERE id=$1 AND user_id=$2 FOR UPDATE",
          [id, user.id],
        )
      ).rows[0];
      need(s, 404, "session_missing", "Sessão não encontrada.");
      if (!terminal(s.state)) {
        if (s.state === "RUNNING" || s.state === "CANCELLING") {
          await tx.query("UPDATE sessions SET state='CANCELLING' WHERE id=$1", [
            id,
          ]);
          return { id, state: "CANCELLING" };
        }
        await this.finalize(tx, s, "CANCELLED", 0n, "cancelled");
      }
      return { id, state: terminal(s.state) ? s.state : "CANCELLED" };
    });
  }
  async fail(id: string, body: unknown) {
    uuid.parse(id);
    const data = z
      .object({ code: z.string().regex(/^[a-z0-9_]{1,60}$/) })
      .strict()
      .parse(body);
    return this.db.transaction(async (tx) => {
      const s = (
        await tx.query("SELECT * FROM sessions WHERE id=$1 FOR UPDATE", [id])
      ).rows[0];
      need(s, 404, "session_missing", "Sessão não encontrada.");
      // A claimed job is resolved by its signed receipt or the deadline, not by an unconfirmed gateway observation.
      if (!terminal(s.state) && !["RUNNING", "CANCELLING"].includes(s.state))
        await this.finalize(tx, s, "FAILED", 0n, data.code);
      return { acknowledged: true };
    });
  }
  async status(id: string) {
    uuid.parse(id);
    const s = (
      await this.db.pool.query(
        "SELECT id,state,error_code FROM sessions WHERE id=$1",
        [id],
      )
    ).rows[0];
    need(s, 404, "session_missing", "Sessão não encontrada.");
    return s;
  }
  async reap() {
    await this.db.transaction(async (tx) => {
      const expired =
        await tx.query(`SELECT s.* FROM sessions s LEFT JOIN nodes n ON n.id=s.node_id
        WHERE s.state NOT IN ('COMPLETED','FAILED','CANCELLED','INTERRUPTED') AND
        ((s.state='QUEUED' AND s.queue_deadline<now()) OR s.execution_deadline<now() OR
         (s.node_id IS NOT NULL AND (n.epoch<>s.node_epoch OR n.desired_state='REVOKED')))
        ORDER BY s.id LIMIT 100 FOR UPDATE OF s SKIP LOCKED`);
      for (const s of expired.rows)
        await this.finalize(
          tx,
          s,
          s.state === "CANCELLING" ? "CANCELLED" : "INTERRUPTED",
          0n,
          s.state === "QUEUED" ? "queue_timeout" : "execution_interrupted",
        );
      await tx.query(
        "DELETE FROM node_nonces WHERE seen_at<now()-interval '5 minutes'",
      );
      await tx.query("DELETE FROM auth_sessions WHERE expires_at<now()");
    });
  }
}
