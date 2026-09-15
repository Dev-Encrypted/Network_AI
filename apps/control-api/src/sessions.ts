// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import {
  modelManifestSchema,
  chargeFor,
  receiptSchema,
  stageReceiptSchema,
  splitByBps,
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
import { capacity } from "./capacity.js";
import { cooperativeEligibility, recycleSettlement } from "./cooperative.js";

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
    const participants = await this.db.pool.query(
      `SELECT p.node_id,p.provider_id,p.resource_domain_id,p.ordinal,p.role,p.share_bps,
      p.node_epoch,p.claimed_at,p.paid_microtu,r.payload AS receipt FROM session_participants p
      LEFT JOIN stage_receipts r ON r.session_id=p.session_id AND r.node_id=p.node_id WHERE p.session_id=$1 ORDER BY p.ordinal`,
      [id],
    );
    return { ...row, events: events.rows, participants: participants.rows };
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
      const quota = await capacity(tx, data.model, user.id);
      need(
        quota.active_for_account < quota.temporary_session_limit,
        429,
        "elastic_session_limit",
        `A cota temporária deste modelo é de ${quota.temporary_session_limit} sessão(ões) por conta. As sessões já aceitas continuam.`,
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
        `INSERT INTO sessions(id,user_id,quote_id,model_id,manifest_sha256,idempotency_key,request_sha256,request_bytes,state,hold_microtu,queue_deadline,cooperative_pool_id,cooperative_policy_sha256)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'QUEUED',$9,now()+interval '120 seconds',$10,$11) RETURNING *`,
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
          quote.cooperative_pool_id,
          quote.cooperative_policy_sha256,
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
  cap(
    session: Row,
    quote: Row,
    node: Row,
    scope:
      | "prepare"
      | "execute"
      | "stage_prepare"
      | "stage_execute"
      | "stage_finish",
  ) {
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
      ...(manifest.generation_profile &&
      (scope === "prepare" || scope === "execute")
        ? { generation_profile: manifest.generation_profile }
        : {}),
      prepare_id: scope.endsWith("prepare") ? null : session.prepare_id,
      exp: Math.floor(new Date(session.execution_deadline).getTime() / 1000),
      ...(session.coverage_lease_id
        ? {
            cooperative_pool_id: session.cooperative_pool_id,
            coverage_lease_id: session.coverage_lease_id,
            coverage_terms_sha256: session.coverage_terms_sha256,
          }
        : {}),
      ...(session.route_id
        ? { route_id: session.route_id, route_sha256: session.route_sha256 }
        : {}),
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
        WHERE s.state='QUEUED' AND s.queue_deadline>now() AND EXISTS (
          SELECT 1 FROM ready_execution_offers o WHERE o.model_id=s.model_id AND ${cooperativeEligibility("s", "o")} AND NOT EXISTS (
            SELECT 1 FROM resource_domains d WHERE d.id=ANY(o.domain_ids)
            AND (SELECT count(*) FROM active_session_domains a WHERE a.resource_domain_id=d.id)>=d.slots))
        ORDER BY u.last_admitted_at,s.created_at,s.id LIMIT 1`)
      ).rows[0];
      if (!next || next.id !== id)
        return { state: "QUEUED", retry_after_ms: 300 };
      const offer = (
        await tx.query(
          `SELECT o.* FROM ready_execution_offers o CROSS JOIN sessions s WHERE s.id=$2 AND o.model_id=$1 AND ${cooperativeEligibility("s", "o")} AND NOT EXISTS (
            SELECT 1 FROM resource_domains d WHERE d.id=ANY(o.domain_ids)
            AND (SELECT count(*) FROM active_session_domains a WHERE a.resource_domain_id=d.id)>=d.slots)
          ORDER BY o.last_seen DESC,o.offer_key LIMIT 1`,
          [s.model_id, s.id],
        )
      ).rows[0];
      if (!offer) return { state: "QUEUED", retry_after_ms: 300 };
      await tx.query(
        "SELECT id FROM resource_domains WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
        [offer.domain_ids],
      );
      const node = (
        await tx.query("SELECT * FROM nodes WHERE id=$1 FOR UPDATE", [
          offer.root_node_id,
        ])
      ).rows[0];
      const route = offer.route_id
        ? (
            await tx.query("SELECT * FROM execution_routes WHERE id=$1", [
              offer.route_id,
            ])
          ).rows[0]
        : null;
      const coverage = s.cooperative_pool_id
        ? (
            await tx.query(
              `SELECT l.* FROM cooperative_windows cw JOIN route_availability_leases l ON l.id=cw.lease_id
        WHERE cw.pool_id=$1 AND l.route_id=$2 AND l.state IN ('ACTIVE','DRAINING') AND l.ends_ms>extract(epoch FROM now())*1000+10000 FOR SHARE OF l`,
              [s.cooperative_pool_id, offer.route_id],
            )
          ).rows[0]
        : null;
      need(
        !s.cooperative_pool_id || coverage,
        409,
        "coverage_ended",
        "A janela cooperativa terminou; solicite outra cotação.",
      );
      const deadline = coverage
        ? new Date(Math.min(Date.now() + 180000, Number(coverage.ends_ms)))
        : new Date(Date.now() + 180000);
      const attempt = randomUUID();
      const updated = (
        await tx.query(
          `UPDATE sessions SET state='PREPARING',node_id=$2,resource_domain_id=$3,attempt_id=$4,node_epoch=$5,
        execution_deadline=$8,route_id=$6,route_sha256=$7,coverage_lease_id=$9,coverage_terms_sha256=$10 WHERE id=$1 RETURNING *`,
          [
            id,
            node.id,
            node.resource_domain_id,
            attempt,
            node.epoch,
            route?.id ?? null,
            route?.route_sha256 ?? null,
            deadline,
            coverage?.id ?? null,
            coverage?.terms_sha256 ?? null,
          ],
        )
      ).rows[0];
      for (const domain of offer.domain_ids)
        await tx.query(
          "INSERT INTO session_domains(session_id,resource_domain_id) VALUES($1,$2)",
          [id, domain],
        );
      let members: Row[] = [];
      if (route) {
        members = (
          await tx.query(
            `SELECT m.*,n.epoch,n.base_url FROM route_members m JOIN nodes n ON n.id=m.node_id
          WHERE m.route_id=$1 ORDER BY m.ordinal FOR SHARE OF n`,
            [route.id],
          )
        ).rows;
        for (const p of members)
          await tx.query(
            `INSERT INTO session_participants(session_id,node_id,provider_id,resource_domain_id,ordinal,role,share_bps,node_epoch)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              id,
              p.node_id,
              p.provider_id,
              p.resource_domain_id,
              p.ordinal,
              p.role,
              p.share_bps,
              p.epoch,
            ],
          );
      }
      await tx.query("UPDATE users SET last_admitted_at=now() WHERE id=$1", [
        s.user_id,
      ]);
      await this.event(tx, id, "admitted", {
        node_id: node.id,
        resource_domain_id: node.resource_domain_id,
        attempt_id: attempt,
        route_id: route?.id ?? null,
        resource_domain_ids: offer.domain_ids,
      });
      const quote = (
        await tx.query("SELECT * FROM quotes WHERE id=$1", [s.quote_id])
      ).rows[0];
      return {
        state: "PREPARING",
        node_url: node.base_url,
        capability: this.cap(updated, quote, node, "prepare"),
        attempt_id: attempt,
        ...(route
          ? {
              route_id: route.id,
              route_sha256: route.route_sha256,
              participants: members.map((p) => ({
                node_id: p.node_id,
                node_url: p.base_url,
                role: p.role,
                ordinal: p.ordinal,
                capability: this.cap(
                  updated,
                  quote,
                  { id: p.node_id, epoch: p.epoch },
                  p.role === "ROOT" ? "prepare" : "stage_prepare",
                ),
              })),
            }
          : {}),
      };
    });
  }
  async authorize(id: string, body: unknown) {
    uuid.parse(id);
    const data = z
      .object({
        prepare_id: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/),
        participants: z
          .array(
            z
              .object({
                node_id: uuid,
                prepare_id: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/),
              })
              .strict(),
          )
          .min(1)
          .max(15)
          .optional(),
      })
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
      const members = s.route_id
        ? await this.currentParticipants(tx, s, true)
        : [];
      if (s.route_id) {
        const stages = members.filter((p) => p.role === "STAGE");
        need(
          data.participants?.length === stages.length &&
            new Set(data.participants.map((p) => p.node_id)).size ===
              stages.length &&
            stages.every((p) =>
              data.participants!.some((v) => v.node_id === p.node_id),
            ),
          409,
          "route_prepare_incomplete",
          "Todas as partes da rota precisam confirmar a preparação.",
        );
        for (const p of members) {
          p.prepare_id =
            p.role === "ROOT"
              ? data.prepare_id
              : data.participants!.find((v) => v.node_id === p.node_id)!
                  .prepare_id;
          await tx.query(
            "UPDATE session_participants SET prepare_id=$3 WHERE session_id=$1 AND node_id=$2",
            [id, p.node_id, p.prepare_id],
          );
        }
      } else
        need(
          !data.participants,
          400,
          "unexpected_stages",
          "Esta sessão não possui etapas distribuídas.",
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
        ...(s.route_id
          ? {
              participants: members
                .filter((p) => p.role === "STAGE")
                .map((p) => ({
                  node_id: p.node_id,
                  node_url: p.base_url,
                  capability: this.cap(
                    { ...s, prepare_id: p.prepare_id },
                    quote,
                    { id: p.node_id, epoch: p.node_epoch },
                    "stage_execute",
                  ),
                  finish_capability: this.cap(
                    { ...s, prepare_id: p.prepare_id },
                    quote,
                    { id: p.node_id, epoch: p.node_epoch },
                    "stage_finish",
                  ),
                })),
            }
          : {}),
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
    return this.db.transaction(async (tx) => {
      const session = (
        await tx.query("SELECT * FROM sessions WHERE id=$1 FOR UPDATE", [
          data.session_id,
        ])
      ).rows[0];
      if (session?.route_id) {
        const members = await this.currentParticipants(tx, session, true);
        need(
          members.filter((p) => p.role === "STAGE").every((p) => p.claimed_at),
          409,
          "route_unclaimed",
          "Todas as etapas precisam reservar sua execução antes do nó principal.",
        );
      }
      const result = await tx.query(
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
      if (session.route_id)
        await tx.query(
          "UPDATE session_participants SET claimed_at=now() WHERE session_id=$1 AND node_id=$2",
          [data.session_id, nodeId],
        );
      return { accepted: true };
    });
  }

  private async currentParticipants(
    tx: PoolClient,
    s: Row,
    preparing = false,
  ): Promise<Row[]> {
    const rows = (
      await tx.query(
        `SELECT p.*,n.base_url,n.epoch AS current_epoch,n.desired_state,n.state,n.last_seen,
      n.owner_id AS current_owner,n.resource_domain_id AS current_domain,u.disabled
      FROM session_participants p JOIN nodes n ON n.id=p.node_id JOIN users u ON u.id=p.provider_id
      WHERE p.session_id=$1 ORDER BY p.ordinal FOR SHARE OF n`,
        [s.id],
      )
    ).rows;
    need(
      rows.length >= 2 &&
        rows.every(
          (p) =>
            p.node_epoch === p.current_epoch &&
            !p.disabled &&
            p.current_owner === p.provider_id &&
            p.current_domain === p.resource_domain_id &&
            p.desired_state !== "REVOKED" &&
            (!preparing ||
              (p.state === "READY" &&
                p.desired_state === "READY" &&
                p.last_seen > new Date(Date.now() - 15000))),
        ),
      409,
      "route_node_changed",
      "Uma etapa da rota mudou ou está indisponível.",
    );
    return rows;
  }

  async stageClaim(nodeId: string, body: unknown) {
    const data = z
      .object({
        session_id: uuid,
        attempt_id: uuid,
        epoch: z.number().int().positive(),
        prepare_id: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/),
      })
      .strict()
      .parse(body);
    return this.db.transaction(async (tx) => {
      const s = (
        await tx.query("SELECT * FROM sessions WHERE id=$1 FOR UPDATE", [
          data.session_id,
        ])
      ).rows[0];
      need(
        s?.route_id &&
          s.state === "AUTHORIZED" &&
          s.attempt_id === data.attempt_id &&
          new Date(s.execution_deadline).getTime() > Date.now(),
        409,
        "stage_claim_rejected",
        "Reserva da etapa expirada, cancelada ou já em execução.",
      );
      const members = await this.currentParticipants(tx, s, true);
      const p = members.find((p) => p.node_id === nodeId && p.role === "STAGE");
      need(
        p &&
          Number(p.node_epoch) === data.epoch &&
          p.prepare_id === data.prepare_id &&
          !p.claimed_at,
        409,
        "stage_claim_rejected",
        "Esta etapa não possui uma autorização disponível.",
      );
      await tx.query(
        "UPDATE session_participants SET claimed_at=now() WHERE session_id=$1 AND node_id=$2",
        [s.id, nodeId],
      );
      await this.event(tx, s.id, "stage_claimed", {
        node_id: nodeId,
        ordinal: p.ordinal,
      });
      return { accepted: true };
    });
  }

  async stageReceipt(nodeId: string, body: unknown) {
    const data = stageReceiptSchema.parse(body),
      digest = hash(canonical(data));
    return this.db.transaction(async (tx) => {
      const s = (
        await tx.query("SELECT * FROM sessions WHERE id=$1 FOR UPDATE", [
          data.session_id,
        ])
      ).rows[0];
      const p = (
        await tx.query(
          "SELECT * FROM session_participants WHERE session_id=$1 AND node_id=$2 AND role='STAGE'",
          [data.session_id, nodeId],
        )
      ).rows[0];
      need(
        s?.route_id &&
          p &&
          s.attempt_id === data.attempt_id &&
          s.route_sha256 === data.route_sha256 &&
          Number(p.node_epoch) === data.epoch,
        409,
        "stage_receipt_identity",
        "Recibo não pertence a esta etapa e tentativa.",
      );
      const old = (
        await tx.query(
          "SELECT digest FROM stage_receipts WHERE session_id=$1 AND node_id=$2",
          [s.id, nodeId],
        )
      ).rows[0];
      if (old) {
        need(
          old.digest === digest,
          409,
          "receipt_conflict",
          "Recibo da etapa conflitante.",
        );
        return { accepted: true, duplicate: true };
      }
      if (terminal(s.state))
        return { accepted: false, terminal: true, state: s.state };
      if (new Date(s.execution_deadline).getTime() <= Date.now()) {
        await this.finalize(tx, s, "INTERRUPTED", 0n, "execution_timeout");
        return { accepted: false, terminal: true, state: "INTERRUPTED" };
      }
      need(
        p.claimed_at &&
          ["AUTHORIZED", "RUNNING", "CANCELLING"].includes(s.state) &&
          (data.state !== "COMPLETED" || s.started_at),
        409,
        "stage_receipt_state",
        "A execução correspondente ainda não foi iniciada.",
      );
      await this.currentParticipants(tx, s);
      await tx.query(
        "INSERT INTO stage_receipts(session_id,node_id,digest,payload) VALUES($1,$2,$3,$4)",
        [s.id, nodeId, digest, data],
      );
      await this.event(tx, s.id, "stage_receipt", {
        node_id: nodeId,
        state: data.state,
        completed_commands: data.completed_commands,
      });
      return this.settleRoute(tx, s);
    });
  }

  private async settleRoute(tx: PoolClient, s: Row) {
    const stages = (
      await tx.query(
        `SELECT p.node_id,r.payload FROM session_participants p LEFT JOIN stage_receipts r
      ON r.session_id=p.session_id AND r.node_id=p.node_id WHERE p.session_id=$1 AND p.role='STAGE' ORDER BY p.ordinal`,
        [s.id],
      )
    ).rows;
    const failed = stages.some(
      (p) =>
        p.payload &&
        (p.payload.state !== "COMPLETED" ||
          p.payload.completed_commands < 1 ||
          BigInt(p.payload.request_bytes) === 0n ||
          BigInt(p.payload.response_bytes) === 0n),
    );
    if (s.state === "CANCELLING" || failed) {
      const state = s.state === "CANCELLING" ? "CANCELLED" : "FAILED";
      await this.finalize(
        tx,
        s,
        state,
        0n,
        failed ? "route_stage_failed" : "cancelled",
      );
      return { accepted: true, state, charged_microtu: "0" };
    }
    const root = (
      await tx.query("SELECT payload FROM receipts WHERE session_id=$1", [s.id])
    ).rows[0]?.payload;
    if (!root || stages.some((p) => !p.payload))
      return { accepted: true, receipt_pending: true, state: s.state };
    await this.currentParticipants(tx, s);
    const quote = (
      await tx.query("SELECT * FROM quotes WHERE id=$1", [s.quote_id])
    ).rows[0];
    const model = modelManifestSchema.parse(quote.manifest);
    const charge = chargeFor(model, root.prompt_tokens, root.completion_tokens);
    await this.finalize(tx, s, "COMPLETED", charge, null);
    return {
      accepted: true,
      state: "COMPLETED",
      charged_microtu: charge.toString(),
    };
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
    let allocation: Record<string, unknown> | undefined;
    if (charge > 0n && s.cooperative_pool_id) {
      const recycled = await recycleSettlement(tx, s, charge);
      lines.push(...recycled.lines);
      allocation = recycled.allocation;
    } else if (charge > 0n) {
      const fee = (charge * 2000n) / 10000n;
      if (s.route_id) {
        const members = (
          await tx.query(
            "SELECT * FROM session_participants WHERE session_id=$1 ORDER BY ordinal",
            [s.id],
          )
        ).rows;
        const payments = splitByBps(
          charge - fee,
          members.map((p) => p.share_bps),
        );
        for (let i = 0; i < members.length; i++) {
          lines.push([availableAccount(members[i].provider_id), payments[i]!]);
          await tx.query(
            "UPDATE session_participants SET paid_microtu=$3 WHERE session_id=$1 AND node_id=$2",
            [s.id, members[i].node_id, payments[i]!.toString()],
          );
        }
      } else {
        const node = (
          await tx.query("SELECT owner_id FROM nodes WHERE id=$1", [s.node_id])
        ).rows[0];
        lines.push([availableAccount(node.owner_id), charge - fee]);
      }
      lines.push(["lab:working", fee]);
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
          fee_bps: s.cooperative_pool_id ? 0 : 2000,
          ...(allocation
            ? {
                cooperative_pool_id: s.cooperative_pool_id,
                coverage_lease_id: s.coverage_lease_id,
                allocation,
              }
            : {}),
          ...(s.route_id
            ? {
                route_id: s.route_id,
                route_sha256: s.route_sha256,
                payout_policy: s.cooperative_pool_id
                  ? "accepted-readiness-only"
                  : "ordinal-prefix-v1",
              }
            : {}),
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
      if (new Date(s.execution_deadline).getTime() <= Date.now()) {
        await this.finalize(tx, s, "INTERRUPTED", 0n, "execution_timeout");
        return { accepted: false, terminal: true, state: "INTERRUPTED" };
      }
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
      if (s.route_id && valid && !cancelled) return this.settleRoute(tx, s);
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
        "SELECT id,state,billing_state,charged_microtu,error_code FROM sessions WHERE id=$1",
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
         (s.node_id IS NOT NULL AND (n.epoch<>s.node_epoch OR n.desired_state='REVOKED')) OR
         EXISTS(SELECT 1 FROM session_participants p JOIN nodes pn ON pn.id=p.node_id JOIN users pu ON pu.id=p.provider_id
           WHERE p.session_id=s.id AND (pn.epoch<>p.node_epoch OR pn.desired_state='REVOKED' OR pu.disabled)))
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
