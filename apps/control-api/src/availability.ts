// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { amount, MAX_AMOUNT, uuid } from "@network-ai/contracts";
import type { User } from "./auth.js";
import { Database } from "./db.js";
import { need } from "./errors.js";
import { availableAccount, post } from "./ledger.js";
import { canonical, hash } from "./security.js";

type Row = Record<string, any>;
const open = (row: Row) => ["OFFERED", "ACTIVE"].includes(row.state);
const clock = async (tx: PoolClient): Promise<number> =>
  Number(
    (
      await tx.query(
        "SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms",
      )
    ).rows[0].ms,
  );

export class Availability {
  constructor(readonly db: Database) {}
  async list(user: User) {
    return (
      await this.db.pool.query(
        `SELECT l.*,n.name AS node_name FROM availability_leases l JOIN nodes n ON n.id=l.node_id
      WHERE l.sponsor_id=$1 OR l.provider_id=$1 OR $2 ORDER BY (l.state IN ('OFFERED','ACTIVE')) DESC,l.created_at DESC LIMIT 100`,
        [user.id, user.role === "admin"],
      )
    ).rows;
  }
  async offer(user: User, body: unknown) {
    const data = z
      .object({
        node_id: uuid,
        duration_seconds: z.number().int().min(30).max(3600),
        rate_microtu_per_second: amount.refine((v) => BigInt(v) > 0n),
        idempotency_key: z.string().regex(/^[A-Za-z0-9_.:-]{8,100}$/),
      })
      .strict()
      .parse(body);
    const budget =
      BigInt(data.rate_microtu_per_second) * BigInt(data.duration_seconds);
    need(budget <= MAX_AMOUNT, 400, "amount_overflow", "Valor fora do limite.");
    const digest = hash(canonical(data));
    return this.db.transaction(async (tx) => {
      await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user.id]);
      const existing = (
        await tx.query(
          "SELECT * FROM availability_leases WHERE sponsor_id=$1 AND idempotency_key=$2",
          [user.id, data.idempotency_key],
        )
      ).rows[0];
      if (existing) {
        need(
          existing.request_sha256 === digest,
          409,
          "idempotency_conflict",
          "Esta chave já foi usada com outra oferta.",
        );
        return existing;
      }
      const active = (
        await tx.query(
          "SELECT count(*)::int AS n FROM availability_leases WHERE sponsor_id=$1 AND state IN ('OFFERED','ACTIVE')",
          [user.id],
        )
      ).rows[0].n;
      need(
        active < 4,
        429,
        "lease_limit",
        "Você já tem quatro contratos abertos.",
      );
      const node = (
        await tx.query(
          `SELECT n.*,m.manifest_sha256 FROM nodes n JOIN models m ON m.id=n.model_id
        JOIN users u ON u.id=n.owner_id WHERE n.id=$1 AND m.state='LOCAL_PREVIEW' AND n.desired_state<>'REVOKED' AND NOT u.disabled`,
          [data.node_id],
        )
      ).rows[0];
      need(
        node,
        409,
        "node_unavailable",
        "O nó ou modelo está indisponível para contribuição.",
      );
      const id = randomUUID();
      const escrow = `lease:${id}:escrow`;
      await tx.query(
        "INSERT INTO ledger_accounts(id,owner_id,kind) VALUES($1,$2,'LEASE_ESCROW')",
        [escrow, user.id],
      );
      await post(
        tx,
        `lease:${id}:fund`,
        "AVAILABILITY_RESERVE",
        [
          [availableAccount(user.id), -budget],
          [escrow, budget],
        ],
        { lease_id: id, policy: "funded-private-v1" },
      );
      const row = (
        await tx.query(
          `INSERT INTO availability_leases(id,sponsor_id,provider_id,node_id,resource_domain_id,model_id,manifest_sha256,
        idempotency_key,request_sha256,escrow_account,state,duration_seconds,rate_microtu_per_second,budget_microtu)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'OFFERED',$11,$12,$13) RETURNING *`,
          [
            id,
            user.id,
            node.owner_id,
            node.id,
            node.resource_domain_id,
            node.model_id,
            node.manifest_sha256,
            data.idempotency_key,
            digest,
            escrow,
            data.duration_seconds,
            data.rate_microtu_per_second,
            budget.toString(),
          ],
        )
      ).rows[0];
      await this.event(tx, id, "offered", {
        budget_microtu: budget.toString(),
        policy: "funded-private-v1",
      });
      return row;
    });
  }
  async accept(user: User, id: string) {
    uuid.parse(id);
    return this.db.transaction(async (tx) => {
      const row = (
        await tx.query(
          "SELECT * FROM availability_leases WHERE id=$1 AND provider_id=$2 FOR UPDATE",
          [id, user.id],
        )
      ).rows[0];
      need(
        row,
        404,
        "lease_missing",
        "Contrato não encontrado para este operador.",
      );
      if (row.state === "ACTIVE") return row;
      need(
        row.state === "OFFERED" &&
          new Date(row.offer_expires_at).getTime() > (await clock(tx)),
        409,
        "offer_expired",
        "A oferta expirou ou foi encerrada.",
      );
      await tx.query("SELECT id FROM resource_domains WHERE id=$1 FOR UPDATE", [
        row.resource_domain_id,
      ]);
      const occupied = await tx.query(
        "SELECT id FROM availability_leases WHERE resource_domain_id=$1 AND state='ACTIVE'",
        [row.resource_domain_id],
      );
      need(
        !occupied.rowCount,
        409,
        "domain_leased",
        "Esta capacidade já possui um contrato ativo.",
      );
      const now = await clock(tx);
      const node = await this.observation(tx, row, now);
      need(
        node?.ready,
        409,
        "node_not_ready",
        "O modelo precisa estar pronto e com presença recente.",
      );
      const value = (
        await tx.query(
          `UPDATE availability_leases SET state='ACTIVE',started_ms=$2,ends_ms=$3,sample_ms=$2,sample_ready=true,node_epoch=$4 WHERE id=$1 RETURNING *`,
          [id, now, now + row.duration_seconds * 1000, node.epoch],
        )
      ).rows[0];
      await this.event(tx, id, "accepted", { epoch: node.epoch });
      return value;
    });
  }
  async cancel(user: User, id: string) {
    uuid.parse(id);
    return this.db.transaction(async (tx) => {
      const row = (
        await tx.query(
          "SELECT * FROM availability_leases WHERE id=$1 AND (sponsor_id=$2 OR provider_id=$2 OR $3) FOR UPDATE",
          [id, user.id, user.role === "admin"],
        )
      ).rows[0];
      need(row, 404, "lease_missing", "Contrato não encontrado.");
      if (open(row)) await this.advance(tx, row, true);
      return (
        await tx.query("SELECT * FROM availability_leases WHERE id=$1", [id])
      ).rows[0];
    });
  }
  async reconcile() {
    const rows = (
      await this.db.pool.query(
        "SELECT id FROM availability_leases WHERE state='ACTIVE' OR (state='OFFERED' AND offer_expires_at<=now()) ORDER BY sample_ms NULLS FIRST,created_at LIMIT 100",
      )
    ).rows;
    for (const { id } of rows)
      await this.db.transaction(async (tx) => {
        const row = (
          await tx.query(
            "SELECT * FROM availability_leases WHERE id=$1 FOR UPDATE",
            [id],
          )
        ).rows[0];
        if (row && open(row)) await this.advance(tx, row, false);
      });
  }
  private async observation(tx: PoolClient, row: Row, now: number) {
    const node = (
      await tx.query(
        `SELECT n.*,m.state AS model_state,m.manifest,m.manifest_sha256,u.disabled AS provider_disabled
      FROM nodes n JOIN models m ON m.id=n.model_id JOIN users u ON u.id=n.owner_id WHERE n.id=$1`,
        [row.node_id],
      )
    ).rows[0];
    if (!node) return null;
    return {
      epoch: node.epoch,
      ready:
        node.state === "READY" &&
        node.desired_state === "READY" &&
        !node.provider_disabled &&
        node.model_state === "LOCAL_PREVIEW" &&
        node.manifest_sha256 === row.manifest_sha256 &&
        node.owner_id === row.provider_id &&
        node.resource_domain_id === row.resource_domain_id &&
        now - new Date(node.last_seen).getTime() <= 5000 &&
        node.loaded_backend_models.includes(node.manifest.backend_model),
    };
  }
  private async advance(tx: PoolClient, row: Row, cancel: boolean) {
    const now = await clock(tx);
    let paid = BigInt(row.paid_microtu);
    let credited = BigInt(row.credited_ms);
    if (row.state === "ACTIVE") {
      const node = await this.observation(tx, row, now);
      const until = Math.max(
        Number(row.sample_ms),
        Math.min(now, Number(row.ends_ms)),
      );
      const elapsed = Math.max(0, until - Number(row.sample_ms));
      // Two fresh observations with the same boot epoch delimit a payable interval.
      // Gaps >6s are not extrapolated across outages, coordinator restarts or missing samples.
      const valid =
        row.sample_ready &&
        node?.ready &&
        String(row.node_epoch) === String(node.epoch) &&
        now - Number(row.sample_ms) <= 6000;
      if (valid) credited += BigInt(elapsed);
      const total = (credited * BigInt(row.rate_microtu_per_second)) / 1000n;
      if (total > paid) {
        await post(
          tx,
          `lease:${row.id}:pay:${credited}`,
          "AVAILABILITY_PAYMENT",
          [
            [row.escrow_account, paid - total],
            [availableAccount(row.provider_id), total - paid],
          ],
          {
            lease_id: row.id,
            credited_ms: credited.toString(),
            policy: "funded-private-v1",
          },
        );
        paid = total;
      }
      await tx.query(
        "UPDATE availability_leases SET sample_ms=$2,sample_ready=$3,node_epoch=$4,credited_ms=$5,paid_microtu=$6 WHERE id=$1",
        [
          row.id,
          until,
          Boolean(node?.ready),
          node?.epoch ?? row.node_epoch,
          credited.toString(),
          paid.toString(),
        ],
      );
      await this.event(
        tx,
        row.id,
        valid ? "observed_ready" : "uncredited_interval",
        {
          elapsed_ms: elapsed,
          credited_ms: credited.toString(),
          paid_microtu: paid.toString(),
        },
      );
    }
    const ended = row.state === "ACTIVE" && now >= Number(row.ends_ms);
    const expired =
      row.state === "OFFERED" &&
      now >= new Date(row.offer_expires_at).getTime();
    if (cancel || ended || expired) {
      const remaining = BigInt(row.budget_microtu) - paid;
      if (remaining > 0n)
        await post(
          tx,
          `lease:${row.id}:refund`,
          "AVAILABILITY_REFUND",
          [
            [row.escrow_account, -remaining],
            [availableAccount(row.sponsor_id), remaining],
          ],
          { lease_id: row.id },
        );
      const state = cancel ? "CANCELLED" : ended ? "COMPLETED" : "EXPIRED";
      await tx.query(
        "UPDATE availability_leases SET state=$2,finished_at=now(),sample_ready=false WHERE id=$1",
        [row.id, state],
      );
      await this.event(tx, row.id, state.toLowerCase(), {
        refunded_microtu: remaining.toString(),
      });
    }
  }
  private async event(
    tx: PoolClient,
    id: string,
    kind: string,
    metadata: Record<string, unknown>,
  ) {
    await tx.query(
      "INSERT INTO availability_events(lease_id,kind,metadata) VALUES($1,$2,$3)",
      [id, kind, metadata],
    );
  }
}
