// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import {
  amount,
  MAX_AMOUNT,
  sha256,
  splitByBps,
  uuid,
} from "@network-ai/contracts";
import type { User } from "./auth.js";
import { Database } from "./db.js";
import { need } from "./errors.js";
import { availableAccount, post } from "./ledger.js";
import { canonical, hash } from "./security.js";

type Row = Record<string, any>;
const funded = (state: string) =>
  ["OFFERED", "ACTIVE", "DRAINING"].includes(state);
const active = (state: string) => ["ACTIVE", "DRAINING"].includes(state);
const policy = "funded-complete-route-v1";
const clock = async (tx: PoolClient): Promise<number> =>
  Number(
    (
      await tx.query(
        "SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms",
      )
    ).rows[0].ms,
  );

export class RouteAvailability {
  constructor(readonly db: Database) {}

  async list(user: User) {
    return (
      await this.db.pool.query(
        `SELECT l.*,r.name AS route_name,
      (SELECT jsonb_agg(jsonb_build_object('node_id',p.node_id,'provider_id',p.provider_id,
        'resource_domain_id',p.resource_domain_id,'node_name',n.name,'provider_name',u.name,
        'role',p.role,'ordinal',p.ordinal,'share_bps',p.share_bps,'maximum_microtu',p.maximum_microtu::text,
        'paid_microtu',p.paid_microtu::text,'credited_ms',p.credited_ms::text,'withdrawn_at',p.withdrawn_at,
        'accepted',a.provider_id IS NOT NULL) ORDER BY p.ordinal)
        FROM route_availability_members p JOIN nodes n ON n.id=p.node_id JOIN users u ON u.id=p.provider_id
        LEFT JOIN route_availability_acceptances a ON a.lease_id=p.lease_id AND a.provider_id=p.provider_id
        WHERE p.lease_id=l.id) AS participants,
      (SELECT jsonb_agg(e ORDER BY e.sequence) FROM (SELECT sequence,kind,metadata,created_at
        FROM route_availability_events WHERE lease_id=l.id ORDER BY sequence DESC LIMIT 20) e) AS events
      FROM route_availability_leases l JOIN execution_routes r ON r.id=l.route_id
      WHERE l.sponsor_id=$1 OR $2 OR EXISTS(SELECT 1 FROM route_availability_members p WHERE p.lease_id=l.id AND p.provider_id=$1)
      ORDER BY (l.state IN ('OFFERED','ACTIVE','DRAINING')) DESC,l.created_at DESC LIMIT 100`,
        [user.id, user.role === "admin"],
      )
    ).rows.map(({ writer_xid, ...row }) => row);
  }

  async offer(user: User, body: unknown) {
    const data = z
      .object({
        route_id: uuid,
        duration_seconds: z.number().int().min(30).max(3600),
        rate_microtu_per_second: amount.refine((v) => BigInt(v) > 0n),
        purpose: z.enum(["REQUESTED", "SCHEDULED", "EXPERIMENT"]),
        reason: z.string().trim().min(20).max(500),
        idempotency_key: uuid,
      })
      .strict()
      .parse(body);
    return this.db.transaction((tx) => this.offerTransaction(tx, user, data));
  }

  async offerTransaction(
    tx: PoolClient,
    user: User,
    data: {
      route_id: string;
      duration_seconds: number;
      rate_microtu_per_second: string;
      purpose: string;
      reason: string;
      idempotency_key: string;
    },
    funding?: { account: string; terms: Record<string, any> },
  ) {
    const budget =
      BigInt(data.rate_microtu_per_second) * BigInt(data.duration_seconds);
    need(budget <= MAX_AMOUNT, 400, "amount_overflow", "Valor fora do limite.");
    const digest = hash(
      canonical(funding ? { ...data, cooperative: funding.terms } : data),
    );
    // Both contract APIs serialize new commitments for the same sponsor.
    await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user.id]);
    const existing = (
      await tx.query(
        "SELECT * FROM route_availability_leases WHERE sponsor_id=$1 AND idempotency_key=$2",
        [user.id, data.idempotency_key],
      )
    ).rows[0];
    if (existing) {
      need(
        existing.request_sha256 === digest,
        409,
        "idempotency_conflict",
        "Identificador usado com outros termos.",
      );
      return this.publicRow(existing);
    }
    const count = (
      await tx.query(
        `SELECT ((SELECT count(*) FROM availability_leases WHERE sponsor_id=$1 AND state IN ('OFFERED','ACTIVE'))+
        (SELECT count(*) FROM route_availability_leases WHERE sponsor_id=$1 AND state IN ('OFFERED','ACTIVE','DRAINING')))::int AS n`,
        [user.id],
      )
    ).rows[0].n;
    need(
      count < 4,
      429,
      "lease_limit",
      "Você já tem quatro contratos abertos.",
    );
    const route = (
      await tx.query(
        `SELECT r.* FROM execution_routes r
        WHERE r.id=$1 AND EXISTS(SELECT 1 FROM ready_execution_offers o WHERE o.route_id=r.id)`,
        [data.route_id],
      )
    ).rows[0];
    need(
      route,
      409,
      "route_not_ready",
      "A oferta precisa de uma rota qualificada, aceita e inteiramente pronta.",
    );
    const members = (
      await tx.query(
        "SELECT * FROM route_members WHERE route_id=$1 ORDER BY ordinal",
        [route.id],
      )
    ).rows;
    const maxima = splitByBps(
      budget,
      members.map((m) => m.share_bps),
    );
    need(
      maxima.every((n) => n > 0n),
      400,
      "lease_allocation",
      "O orçamento precisa remunerar todas as etapas com pelo menos um microcrédito.",
    );
    const id = randomUUID();
    const escrow = `route-lease:${id}:escrow`;
    const terms = {
      policy,
      lease_id: id,
      sponsor_id: user.id,
      route_id: route.id,
      route_sha256: route.route_sha256,
      manifest_sha256: route.manifest_sha256,
      duration_seconds: data.duration_seconds,
      rate_microtu_per_second: data.rate_microtu_per_second,
      budget_microtu: budget.toString(),
      purpose: data.purpose,
      reason: data.reason,
      compensation: funding ? "READINESS_ONLY" : "ADDITIONAL_TO_INFERENCE",
      ...(funding ? { cooperative: funding.terms } : {}),
      cancellation: "PRESERVE_OTHER_ACCEPTED_COMPONENTS_UNTIL_END",
      members: members.map((m, i) => ({
        node_id: m.node_id,
        provider_id: m.provider_id,
        resource_domain_id: m.resource_domain_id,
        ordinal: m.ordinal,
        role: m.role,
        share_bps: m.share_bps,
        maximum_microtu: maxima[i]!.toString(),
      })),
    };
    const termsHash = hash(canonical(terms));
    await tx.query(
      "INSERT INTO ledger_accounts(id,owner_id,kind) VALUES($1,$2,'LEASE_ESCROW')",
      [escrow, funding ? null : user.id],
    );
    await post(
      tx,
      `route-lease:${id}:fund`,
      "ROUTE_AVAILABILITY_RESERVE",
      [
        [funding?.account ?? availableAccount(user.id), -budget],
        [escrow, budget],
      ],
      { lease_id: id, terms_sha256: termsHash, policy },
    );
    const row = (
      await tx.query(
        `INSERT INTO route_availability_leases(id,sponsor_id,route_id,route_sha256,manifest_sha256,
        terms_sha256,terms,purpose,reason,idempotency_key,request_sha256,escrow_account,duration_seconds,rate_microtu_per_second,budget_microtu)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
        [
          id,
          user.id,
          route.id,
          route.route_sha256,
          route.manifest_sha256,
          termsHash,
          terms,
          data.purpose,
          data.reason,
          data.idempotency_key,
          digest,
          escrow,
          data.duration_seconds,
          data.rate_microtu_per_second,
          budget.toString(),
        ],
      )
    ).rows[0];
    for (const m of terms.members)
      await tx.query(
        `INSERT INTO route_availability_members(lease_id,node_id,provider_id,resource_domain_id,ordinal,role,share_bps,maximum_microtu)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          id,
          m.node_id,
          m.provider_id,
          m.resource_domain_id,
          m.ordinal,
          m.role,
          m.share_bps,
          m.maximum_microtu,
        ],
      );
    await this.event(tx, id, "offered", {
      terms_sha256: termsHash,
      budget_microtu: budget.toString(),
      policy,
    });
    return this.publicRow(row);
  }

  async accept(user: User, id: string, body: unknown) {
    uuid.parse(id);
    const data = z.object({ terms_sha256: sha256 }).strict().parse(body);
    return this.db.transaction(async (tx) => {
      const row = (
        await tx.query(
          `SELECT l.* FROM route_availability_leases l WHERE l.id=$1
        AND EXISTS(SELECT 1 FROM route_availability_members p WHERE p.lease_id=l.id AND p.provider_id=$2) FOR UPDATE`,
          [id, user.id],
        )
      ).rows[0];
      need(
        row,
        404,
        "lease_missing",
        "Contrato não encontrado para este operador.",
      );
      need(
        row.terms_sha256 === data.terms_sha256,
        409,
        "lease_terms",
        "Confira e aceite exatamente os termos desta oferta.",
      );
      const prior = (
        await tx.query(
          "SELECT 1 FROM route_availability_acceptances WHERE lease_id=$1 AND provider_id=$2",
          [id, user.id],
        )
      ).rowCount;
      if (prior && row.state !== "OFFERED") return this.publicRow(row);
      need(
        row.state === "OFFERED" &&
          new Date(row.offer_expires_at).getTime() > (await clock(tx)),
        409,
        "offer_expired",
        "A oferta expirou ou foi encerrada.",
      );
      if (!prior) {
        await tx.query(
          "INSERT INTO route_availability_acceptances(lease_id,provider_id,terms_sha256) VALUES($1,$2,$3)",
          [id, user.id, data.terms_sha256],
        );
        await this.event(tx, id, "provider_accepted", {
          provider_id: user.id,
          terms_sha256: data.terms_sha256,
        });
      }
      const missing = (
        await tx.query(
          `SELECT 1 FROM route_availability_members p LEFT JOIN route_availability_acceptances a
        ON a.lease_id=p.lease_id AND a.provider_id=p.provider_id WHERE p.lease_id=$1 AND a.provider_id IS NULL LIMIT 1`,
          [id],
        )
      ).rowCount;
      if (missing) return this.publicRow(row);
      const domains = (
        await tx.query(
          "SELECT DISTINCT resource_domain_id FROM route_availability_members WHERE lease_id=$1 ORDER BY resource_domain_id",
          [id],
        )
      ).rows.map((r) => r.resource_domain_id);
      await tx.query(
        "SELECT id FROM resource_domains WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
        [domains],
      );
      const occupied = (
        await tx.query(
          "SELECT 1 FROM availability_domain_claims WHERE resource_domain_id=ANY($1::uuid[]) LIMIT 1",
          [domains],
        )
      ).rowCount;
      need(
        !occupied,
        409,
        "domain_leased",
        "Uma das capacidades físicas já possui contrato ativo.",
      );
      const now = await clock(tx);
      if (row.terms.cooperative) {
        const p = (
          await tx.query(
            "SELECT paused,support_until FROM cooperative_pools WHERE id=$1",
            [row.terms.cooperative.pool_id],
          )
        ).rows[0];
        need(
          p &&
            !p.paused &&
            Math.min(
              new Date(p.support_until).getTime(),
              new Date(row.terms.cooperative.support_until).getTime(),
            ) >=
              now + row.duration_seconds * 1000,
          409,
          "support_window",
          "O apoio operacional não cobre mais a janela completa.",
        );
      }
      const observation = await this.observe(tx, row, now);
      need(
        observation.joint,
        409,
        "route_not_ready",
        "Todas as etapas precisam estar prontas, com presença recente e os termos originais.",
      );
      for (const p of observation.members)
        await tx.query(
          "UPDATE route_availability_members SET sample_ready=true,node_epoch=$3 WHERE lease_id=$1 AND node_id=$2",
          [id, p.node_id, p.epoch],
        );
      const result = (
        await tx.query(
          `UPDATE route_availability_leases SET state='ACTIVE',started_ms=$2,ends_ms=$3,
        sample_ms=$2,sample_ready=true WHERE id=$1 RETURNING *`,
          [id, now, now + row.duration_seconds * 1000],
        )
      ).rows[0];
      await this.event(tx, id, "activated", {
        started_ms: now,
        ends_ms: Number(result.ends_ms),
        physical_domains: domains.length,
      });
      return this.publicRow(result);
    });
  }

  async cancel(user: User, id: string) {
    uuid.parse(id);
    return this.db.transaction(async (tx) => {
      const row = (
        await tx.query(
          `SELECT l.* FROM route_availability_leases l WHERE l.id=$1 AND
        (l.sponsor_id=$2 OR $3 OR EXISTS(SELECT 1 FROM route_availability_members p WHERE p.lease_id=l.id AND p.provider_id=$2)) FOR UPDATE`,
          [id, user.id, user.role === "admin"],
        )
      ).rows[0];
      need(row, 404, "lease_missing", "Contrato não encontrado.");
      if (row.state === "OFFERED") {
        await this.close(tx, row, "CANCELLED", BigInt(row.paid_microtu));
      } else if (active(row.state)) {
        await this.advance(tx, row);
        const current = (
          await tx.query(
            "SELECT * FROM route_availability_leases WHERE id=$1",
            [id],
          )
        ).rows[0];
        if (active(current.state)) {
          // A sponsor cannot retrospectively revoke the other providers' funded window.
          // An exiting provider relinquishes only its own future readiness earnings.
          const exited = await tx.query(
            `UPDATE route_availability_members SET withdrawn_at=now(),sample_ready=false
            WHERE lease_id=$1 AND provider_id=$2 AND withdrawn_at IS NULL RETURNING node_id`,
            [id, user.id],
          );
          await tx.query(
            "UPDATE route_availability_leases SET state='DRAINING',sample_ready=false WHERE id=$1",
            [id],
          );
          if (current.state !== "DRAINING" || exited.rowCount)
            await this.event(tx, id, "drain_requested", {
              actor_id: user.id,
              withdrawn_nodes: exited.rows.map((p) => p.node_id),
              ends_ms: Number(current.ends_ms),
            });
        }
      }
      return this.publicRow(
        (
          await tx.query(
            "SELECT * FROM route_availability_leases WHERE id=$1",
            [id],
          )
        ).rows[0],
      );
    });
  }

  async reconcile() {
    const rows = (
      await this.db.pool
        .query(`SELECT id FROM route_availability_leases WHERE state IN ('ACTIVE','DRAINING')
      OR (state='OFFERED' AND offer_expires_at<=now()) ORDER BY sample_ms NULLS FIRST,created_at LIMIT 100`)
    ).rows;
    for (const { id } of rows)
      await this.db.transaction(async (tx) => {
        const row = (
          await tx.query(
            "SELECT * FROM route_availability_leases WHERE id=$1 FOR UPDATE",
            [id],
          )
        ).rows[0];
        if (row && funded(row.state)) await this.advance(tx, row);
      });
  }

  private async observe(tx: PoolClient, row: Row, now: number) {
    const route = (
      await tx.query(
        "SELECT state,route_sha256,manifest_sha256 FROM execution_routes WHERE id=$1",
        [row.route_id],
      )
    ).rows[0];
    const parts = (
      await tx.query(
        `SELECT p.*,n.epoch,n.state,n.desired_state,n.last_seen,n.loaded_backend_models,
      n.owner_id,n.resource_domain_id AS current_domain,n.model_id,n.node_kind,u.disabled,m.state AS model_state,
      m.manifest,m.manifest_sha256,a.withdrawn_at AS route_withdrawn_at,a.route_sha256 AS accepted_route_sha256
      FROM route_availability_members p JOIN nodes n ON n.id=p.node_id JOIN users u ON u.id=p.provider_id
      JOIN models m ON m.id=n.model_id LEFT JOIN route_acceptances a ON a.route_id=$2 AND a.provider_id=p.provider_id
      WHERE p.lease_id=$1 ORDER BY p.ordinal`,
        [row.id, row.route_id],
      )
    ).rows;
    const members = parts.map((p) => ({
      ...p,
      ready: Boolean(
        !p.withdrawn_at &&
        !p.route_withdrawn_at &&
        p.accepted_route_sha256 === row.route_sha256 &&
        p.state === "READY" &&
        p.desired_state === "READY" &&
        !p.disabled &&
        p.model_state === "LOCAL_PREVIEW" &&
        p.manifest_sha256 === row.manifest_sha256 &&
        p.owner_id === p.provider_id &&
        p.current_domain === p.resource_domain_id &&
        p.node_kind === (p.role === "ROOT" ? "ROUTE_ROOT" : "RPC_STAGE") &&
        p.last_seen &&
        now - new Date(p.last_seen).getTime() <= 5000 &&
        p.loaded_backend_models.includes(p.manifest.backend_model),
      ),
    }));
    const joint = Boolean(
      route?.state === "LOCAL_PREVIEW" &&
      route.route_sha256 === row.route_sha256 &&
      route.manifest_sha256 === row.manifest_sha256 &&
      members.length >= 2 &&
      members.every((p) => p.ready),
    );
    return { members, joint };
  }

  private async advance(tx: PoolClient, row: Row) {
    const now = await clock(tx);
    if (row.state === "OFFERED") {
      if (now >= new Date(row.offer_expires_at).getTime())
        await this.close(tx, row, "EXPIRED", 0n);
      return;
    }
    const previous = Number(row.sample_ms);
    if (now < previous) return; // A backwards wall clock cannot replay a paid interval.
    const until = Math.max(previous, Math.min(now, Number(row.ends_ms)));
    const elapsed = until - previous;
    const observation = await this.observe(tx, row, now);
    const contiguous = now - previous <= 6000;
    const lines: Array<[string, bigint]> = [];
    let paid = 0n;
    let allValid = row.sample_ready && observation.joint && contiguous;
    const evidence = [];
    for (const p of observation.members) {
      const valid =
        contiguous &&
        p.sample_ready &&
        p.ready &&
        String(p.node_epoch) === String(p.epoch);
      allValid &&= valid;
      const credited = BigInt(p.credited_ms) + (valid ? BigInt(elapsed) : 0n);
      const total =
        (credited * BigInt(p.maximum_microtu)) /
        BigInt(row.duration_seconds * 1000);
      const delta = total - BigInt(p.paid_microtu);
      need(
        delta >= 0n && total <= BigInt(p.maximum_microtu),
        500,
        "lease_projection",
        "Projeção do contrato inconsistente.",
      );
      if (delta > 0n) lines.push([availableAccount(p.provider_id), delta]);
      paid += total;
      await tx.query(
        `UPDATE route_availability_members SET credited_ms=$3,paid_microtu=$4,sample_ready=$5,node_epoch=$6
        WHERE lease_id=$1 AND node_id=$2`,
        [
          row.id,
          p.node_id,
          credited.toString(),
          total.toString(),
          p.ready,
          p.epoch,
        ],
      );
      evidence.push({
        node_id: p.node_id,
        ready: p.ready,
        interval_credited: Boolean(valid),
        epoch: String(p.epoch),
        credited_ms: credited.toString(),
        paid_microtu: total.toString(),
      });
    }
    const delta = paid - BigInt(row.paid_microtu);
    if (delta > 0n) {
      lines.push([row.escrow_account, -delta]);
      await post(
        tx,
        `route-lease:${row.id}:pay:${paid}`,
        "ROUTE_AVAILABILITY_PAYMENT",
        lines,
        {
          lease_id: row.id,
          terms_sha256: row.terms_sha256,
          policy,
          participants: evidence,
        },
      );
    }
    const jointMs =
      BigInt(row.joint_ready_ms) + (allValid ? BigInt(elapsed) : 0n);
    // Once degraded or withdrawn, the accepted window drains without silent renewal.
    const state = !observation.joint ? "DRAINING" : row.state;
    await tx.query(
      `UPDATE route_availability_leases SET state=$2,paid_microtu=$3,joint_ready_ms=$4,sample_ms=$5,sample_ready=$6 WHERE id=$1`,
      [
        row.id,
        state,
        paid.toString(),
        jointMs.toString(),
        until,
        observation.joint,
      ],
    );
    await this.event(tx, row.id, "observed", {
      elapsed_ms: elapsed,
      joint_ready: observation.joint,
      joint_interval_credited: Boolean(allValid),
      joint_ready_ms: jointMs.toString(),
      participants: evidence,
    });
    if (row.state !== "DRAINING" && state === "DRAINING")
      await this.event(tx, row.id, "route_degraded", {
        ends_ms: Number(row.ends_ms),
        accepted_obligations_preserved: true,
      });
    if (now >= Number(row.ends_ms))
      await this.close(tx, row, "COMPLETED", paid);
  }

  private async close(tx: PoolClient, row: Row, state: string, paid: bigint) {
    const remaining = BigInt(row.budget_microtu) - paid;
    if (remaining > 0n)
      await post(
        tx,
        `route-lease:${row.id}:refund`,
        "ROUTE_AVAILABILITY_REFUND",
        [
          [row.escrow_account, -remaining],
          [
            row.terms.cooperative
              ? `coop:${row.terms.cooperative.pool_id}:${row.terms.cooperative.funding_source === "WORKING" ? "working" : "reserve"}`
              : availableAccount(row.sponsor_id),
            remaining,
          ],
        ],
        { lease_id: row.id, terms_sha256: row.terms_sha256, policy },
      );
    await tx.query(
      "UPDATE route_availability_leases SET state=$2,finished_at=now(),sample_ready=false WHERE id=$1",
      [row.id, state],
    );
    await this.event(tx, row.id, state.toLowerCase(), {
      paid_microtu: paid.toString(),
      refunded_microtu: remaining.toString(),
    });
  }

  private async event(
    tx: PoolClient,
    id: string,
    kind: string,
    metadata: Record<string, unknown>,
  ) {
    await tx.query(
      "INSERT INTO route_availability_events(lease_id,kind,metadata) VALUES($1,$2,$3)",
      [id, kind, metadata],
    );
  }
  private publicRow({ writer_xid, ...row }: Row) {
    return row;
  }
}
